//! Supervises the Node.js local runtime sidecar.
//!
//! The sidecar is started from two app-controlled paths (the bundled Node
//! binary next to the executable and the bundled `sidecar.mjs` resource) with
//! a fixed argument list, no shell, and a cleared environment. It speaks
//! newline-delimited JSON over stdio only. Process separation is not a
//! sandbox; Node's permission model narrows what the sidecar can do but is not
//! OS-level isolation.

use std::ffi::OsString;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command, ExitStatus, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager, Runtime};

const PROTOCOL_VERSION: u32 = 1;
const RUNTIME_NAME: &str = "agenthub-local-runtime";
const MAX_LINE_BYTES: u64 = 64 * 1024;
const HEALTH_INTERVAL: Duration = Duration::from_secs(5);
const HEALTH_STALE_AFTER: Duration = Duration::from_secs(15);
const READY_TIMEOUT: Duration = Duration::from_secs(10);
const STOP_GRACE: Duration = Duration::from_secs(2);

#[cfg(windows)]
const NODE_FILE: &str = "agenthub-node.exe";
#[cfg(not(windows))]
const NODE_FILE: &str = "agenthub-node";
const SCRIPT_RESOURCE: &str = "local-runtime/sidecar.mjs";

const MISSING: &str = "The local runtime is not installed with this app.";
const SPAWN_FAILED: &str = "The local runtime could not be started.";
const PROTOCOL_VIOLATION: &str = "The local runtime sent an unexpected message and was stopped.";
const EXITED: &str = "The local runtime exited unexpectedly.";
const NOT_RESPONDING: &str = "The local runtime is not responding.";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SidecarState {
    Starting,
    Healthy,
    Unhealthy,
    Stopped,
    Failed,
}

/// Mirrored by `sidecarStatusSchema` in apps/desktop/src/sidecar-status.ts.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarStatus {
    pub state: SidecarState,
    pub pid: Option<u32>,
    pub version: Option<String>,
    pub last_health_at_ms: Option<u64>,
    pub exit_code: Option<i32>,
    pub error: Option<&'static str>,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum Incoming {
    Ready {
        protocol: u32,
        name: String,
        version: String,
        pid: u32,
    },
    Health {
        id: String,
        status: String,
    },
    Error {
        code: String,
    },
}

pub struct Launch {
    node: PathBuf,
    script: PathBuf,
}

impl Launch {
    pub fn resolve<R: Runtime>(app: &AppHandle<R>) -> Result<Self, &'static str> {
        let exe = std::env::current_exe().map_err(|_| MISSING)?;
        let node = exe.parent().ok_or(MISSING)?.join(NODE_FILE);
        let script = app
            .path()
            .resolve(SCRIPT_RESOURCE, BaseDirectory::Resource)
            .map_err(|_| MISSING)?;
        let (node, script) = (plain_path(node), plain_path(script));
        if !node.is_file() || !script.is_file() {
            return Err(MISSING);
        }
        Ok(Self { node, script })
    }

    /// Must stay in step with `sidecarNodeArgs` in apps/local-runtime/src/launch.ts,
    /// which the sidecar's process tests run under.
    fn command(&self) -> Command {
        let mut allow_read = OsString::from("--allow-fs-read=");
        allow_read.push(&self.script);

        let mut command = Command::new(&self.node);
        command
            .arg("--permission")
            .arg(allow_read)
            .arg("--no-addons")
            .arg("--disallow-code-generation-from-strings")
            .arg(&self.script)
            .env_clear()
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        if let Some(dir) = self.script.parent() {
            command.current_dir(dir);
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            command.creation_flags(CREATE_NO_WINDOW);
            if let Some(root) = std::env::var_os("SystemRoot") {
                command.env("SystemRoot", root);
            }
        }
        command
    }
}

/// Node's permission model compares paths textually, so drop the Windows
/// verbatim prefix (`\\?\C:\...`) that resource resolution can return.
fn plain_path(path: PathBuf) -> PathBuf {
    #[cfg(windows)]
    {
        if let Some(text) = path.to_str() {
            if let Some(rest) = text.strip_prefix(r"\\?\") {
                if rest.as_bytes().get(1) == Some(&b':') {
                    return PathBuf::from(rest);
                }
            }
        }
    }
    path
}

fn valid_version(version: &str) -> bool {
    !version.is_empty()
        && version.len() <= 64
        && version
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-' || b == b'+')
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn unix_millis() -> Option<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|elapsed| u64::try_from(elapsed.as_millis()).ok())
}

fn wait_for(child: &mut Child, limit: Duration) -> Option<ExitStatus> {
    let deadline = Instant::now() + limit;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return Some(status),
            Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(50)),
            _ => return None,
        }
    }
}

fn reap(child: &mut Child, grace: Duration) -> Option<ExitStatus> {
    wait_for(child, grace).or_else(|| {
        let _ = child.kill();
        child.wait().ok()
    })
}

struct Shared {
    status: SidecarStatus,
    started: Option<Instant>,
    ready_seen: bool,
    last_health: Option<Instant>,
    pending_health: Option<String>,
}

#[derive(Debug, PartialEq, Eq)]
enum Step {
    Continue,
    RequestHealth,
}

impl Shared {
    /// `Ready` is accepted once, first. Anything before it, or a second
    /// `Ready`, is a protocol violation and the sidecar is stopped.
    fn apply(&mut self, message: Incoming, pid: u32) -> Result<Step, &'static str> {
        match message {
            Incoming::Ready {
                protocol,
                name,
                version,
                pid: reported,
            } => {
                if self.ready_seen
                    || self.status.state != SidecarState::Starting
                    || protocol != PROTOCOL_VERSION
                    || name != RUNTIME_NAME
                    || reported != pid
                    || !valid_version(&version)
                {
                    return Err(PROTOCOL_VIOLATION);
                }
                self.ready_seen = true;
                self.status.version = Some(version);
                Ok(Step::RequestHealth)
            }
            Incoming::Health { id, status } => {
                if !self.ready_seen {
                    return Err(PROTOCOL_VIOLATION);
                }
                if status == "ok" && self.pending_health.as_deref() == Some(id.as_str()) {
                    self.pending_health = None;
                    self.last_health = Some(Instant::now());
                    self.status.last_health_at_ms = unix_millis();
                    self.status.state = SidecarState::Healthy;
                    self.status.error = None;
                }
                Ok(Step::Continue)
            }
            Incoming::Error { code } => {
                if !self.ready_seen {
                    return Err(PROTOCOL_VIOLATION);
                }
                if cfg!(debug_assertions) {
                    eprintln!("local runtime rejected a message from the shell: {code}");
                }
                Ok(Step::Continue)
            }
        }
    }
}

impl Default for Shared {
    fn default() -> Self {
        Self {
            status: SidecarStatus {
                state: SidecarState::Starting,
                pid: None,
                version: None,
                last_health_at_ms: None,
                exit_code: None,
                error: None,
            },
            started: None,
            ready_seen: false,
            last_health: None,
            pending_health: None,
        }
    }
}

#[derive(Default)]
struct Inner {
    shared: Mutex<Shared>,
    child: Mutex<Option<Child>>,
    stdin: Mutex<Option<ChildStdin>>,
    stopping: AtomicBool,
    next_id: AtomicU64,
}

#[derive(Default)]
pub struct Sidecar {
    inner: Arc<Inner>,
}

impl Sidecar {
    pub fn start(&self, launch: Result<Launch, &'static str>) {
        let launch = match launch {
            Ok(launch) => launch,
            Err(reason) => return self.inner.mark_failed(reason),
        };
        let mut child = match launch.command().spawn() {
            Ok(child) => child,
            Err(_) => return self.inner.mark_failed(SPAWN_FAILED),
        };

        let pid = child.id();
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        {
            let mut shared = lock(&self.inner.shared);
            shared.status.pid = Some(pid);
            shared.started = Some(Instant::now());
        }
        *lock(&self.inner.stdin) = child.stdin.take();
        *lock(&self.inner.child) = Some(child);

        if let Some(stdout) = stdout {
            let inner = Arc::clone(&self.inner);
            thread::spawn(move || inner.read_stdout(stdout, pid));
        }
        if let Some(stderr) = stderr {
            thread::spawn(move || drain(stderr));
        }
        let inner = Arc::clone(&self.inner);
        thread::spawn(move || inner.health_loop());
    }

    pub fn status(&self) -> SidecarStatus {
        self.inner.snapshot()
    }

    pub fn stop(&self) {
        self.inner.stop();
    }
}

impl Inner {
    fn snapshot(&self) -> SidecarStatus {
        let shared = lock(&self.shared);
        let mut status = shared.status.clone();
        let now = Instant::now();
        let stale = match status.state {
            SidecarState::Healthy => shared
                .last_health
                .map_or(true, |at| now.duration_since(at) > HEALTH_STALE_AFTER),
            SidecarState::Starting => shared
                .started
                .is_some_and(|at| now.duration_since(at) > READY_TIMEOUT),
            _ => false,
        };
        if stale {
            status.state = SidecarState::Unhealthy;
            status.error = Some(NOT_RESPONDING);
        }
        status
    }

    fn mark_failed(&self, reason: &'static str) {
        let mut shared = lock(&self.shared);
        shared.status.state = SidecarState::Failed;
        shared.status.error = Some(reason);
    }

    fn fail_and_kill(&self, reason: &'static str) {
        if !self.stopping.load(Ordering::SeqCst) {
            self.mark_failed(reason);
        }
        if let Some(child) = lock(&self.child).as_mut() {
            let _ = child.kill();
        }
    }

    fn send(&self, line: &str) -> bool {
        let mut stdin = lock(&self.stdin);
        match stdin.as_mut() {
            Some(pipe) => write_line(pipe, line).is_ok(),
            None => false,
        }
    }

    fn request_health(&self) {
        let id = format!("h-{}", self.next_id.fetch_add(1, Ordering::Relaxed));
        let line = serde_json::json!({ "type": "health", "id": &id }).to_string();
        lock(&self.shared).pending_health = Some(id);
        self.send(&line);
    }

    fn health_loop(&self) {
        loop {
            thread::sleep(HEALTH_INTERVAL);
            if self.stopping.load(Ordering::SeqCst) {
                return;
            }
            let (state, started) = {
                let shared = lock(&self.shared);
                (shared.status.state, shared.started)
            };
            match state {
                SidecarState::Healthy => self.request_health(),
                SidecarState::Starting => {
                    if started.is_some_and(|at| at.elapsed() > READY_TIMEOUT) {
                        self.fail_and_kill(NOT_RESPONDING);
                        return;
                    }
                }
                _ => return,
            }
        }
    }

    fn read_stdout(&self, stdout: ChildStdout, pid: u32) {
        let mut reader = BufReader::new(stdout);
        let mut line = Vec::new();
        loop {
            line.clear();
            match (&mut reader).take(MAX_LINE_BYTES + 1).read_until(b'\n', &mut line) {
                Ok(0) | Err(_) => break,
                Ok(_) => {}
            }
            if line.last() != Some(&b'\n') {
                self.fail_and_kill(PROTOCOL_VIOLATION);
                break;
            }
            line.pop();
            if line.last() == Some(&b'\r') {
                line.pop();
            }
            if let Err(reason) = self.handle_line(&line, pid) {
                self.fail_and_kill(reason);
                break;
            }
        }
        self.on_stdout_closed();
    }

    fn handle_line(&self, line: &[u8], pid: u32) -> Result<(), &'static str> {
        let message: Incoming = serde_json::from_slice(line).map_err(|_| PROTOCOL_VIOLATION)?;
        let step = lock(&self.shared).apply(message, pid)?;
        if step == Step::RequestHealth {
            self.request_health();
        }
        Ok(())
    }

    fn on_stdout_closed(&self) {
        let exit = lock(&self.child)
            .as_mut()
            .and_then(|child| reap(child, STOP_GRACE));
        let stopping = self.stopping.load(Ordering::SeqCst);
        let mut shared = lock(&self.shared);
        shared.status.pid = None;
        shared.status.exit_code = exit.and_then(|status| status.code());
        if shared.status.state != SidecarState::Failed {
            if stopping {
                shared.status.state = SidecarState::Stopped;
            } else {
                shared.status.state = SidecarState::Failed;
                shared.status.error = Some(EXITED);
            }
        }
    }

    fn stop(&self) {
        if self.stopping.swap(true, Ordering::SeqCst) {
            return;
        }
        self.send(r#"{"type":"shutdown"}"#);
        drop(lock(&self.stdin).take());
        if let Some(child) = lock(&self.child).as_mut() {
            reap(child, STOP_GRACE);
        }
        let mut shared = lock(&self.shared);
        shared.status.pid = None;
        if shared.status.state != SidecarState::Failed {
            shared.status.state = SidecarState::Stopped;
        }
    }
}

fn write_line(pipe: &mut ChildStdin, line: &str) -> std::io::Result<()> {
    pipe.write_all(line.as_bytes())?;
    pipe.write_all(b"\n")?;
    pipe.flush()
}

fn drain(mut stderr: ChildStderr) {
    let mut buffer = [0u8; 4096];
    while let Ok(read) = stderr.read(&mut buffer) {
        if read == 0 {
            break;
        }
        if cfg!(debug_assertions) {
            eprint!("{}", String::from_utf8_lossy(&buffer[..read]));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_plain_versions_only() {
        assert!(valid_version("0.0.0"));
        assert!(valid_version("1.2.3-beta.1+build"));
        assert!(!valid_version(""));
        assert!(!valid_version("1.0; rm -rf /"));
        assert!(!valid_version(&"1".repeat(65)));
    }

    #[test]
    fn parses_the_ready_message() {
        let message: Incoming = serde_json::from_str(
            r#"{"type":"ready","protocol":1,"name":"agenthub-local-runtime","version":"0.0.0","pid":7}"#,
        )
        .expect("ready parses");
        assert!(matches!(message, Incoming::Ready { protocol: 1, pid: 7, .. }));
    }

    #[test]
    fn rejects_unknown_message_types() {
        assert!(serde_json::from_str::<Incoming>(r#"{"type":"exec","command":"sh"}"#).is_err());
        assert!(serde_json::from_str::<Incoming>("not json").is_err());
    }

    #[cfg(windows)]
    #[test]
    fn strips_the_verbatim_drive_prefix() {
        assert_eq!(
            plain_path(PathBuf::from(r"\\?\C:\Program Files\AgentHub\sidecar.mjs")),
            PathBuf::from(r"C:\Program Files\AgentHub\sidecar.mjs")
        );
        assert_eq!(
            plain_path(PathBuf::from(r"\\?\UNC\server\share")),
            PathBuf::from(r"\\?\UNC\server\share")
        );
    }

    fn ready(pid: u32) -> Incoming {
        Incoming::Ready {
            protocol: PROTOCOL_VERSION,
            name: RUNTIME_NAME.to_string(),
            version: "0.0.0".to_string(),
            pid,
        }
    }

    fn health(id: &str) -> Incoming {
        Incoming::Health {
            id: id.to_string(),
            status: "ok".to_string(),
        }
    }

    #[test]
    fn becomes_healthy_after_ready_and_a_matching_health_reply() {
        let mut shared = Shared::default();
        assert_eq!(shared.apply(ready(7), 7), Ok(Step::RequestHealth));
        assert_eq!(shared.status.state, SidecarState::Starting);
        shared.pending_health = Some("h-0".to_string());
        assert_eq!(shared.apply(health("h-0"), 7), Ok(Step::Continue));
        assert_eq!(shared.status.state, SidecarState::Healthy);
        assert_eq!(shared.pending_health, None);
    }

    #[test]
    fn rejects_health_before_ready() {
        let mut shared = Shared::default();
        assert_eq!(shared.apply(health("h-0"), 7), Err(PROTOCOL_VIOLATION));
        assert_eq!(
            shared.apply(Incoming::Error { code: "invalid_message".to_string() }, 7),
            Err(PROTOCOL_VIOLATION)
        );
    }

    #[test]
    fn ignores_a_health_reply_with_another_id() {
        let mut shared = Shared::default();
        shared.apply(ready(7), 7).expect("ready accepted");
        shared.pending_health = Some("h-0".to_string());
        assert_eq!(shared.apply(health("h-9"), 7), Ok(Step::Continue));
        assert_eq!(shared.status.state, SidecarState::Starting);
        assert_eq!(shared.pending_health.as_deref(), Some("h-0"));
    }

    #[test]
    fn rejects_a_second_ready_and_a_wrong_pid() {
        let mut shared = Shared::default();
        assert_eq!(shared.apply(ready(8), 7), Err(PROTOCOL_VIOLATION));
        shared.apply(ready(7), 7).expect("ready accepted");
        assert_eq!(shared.apply(ready(7), 7), Err(PROTOCOL_VIOLATION));
    }

    #[test]
    fn reports_a_fresh_sidecar_as_starting() {
        let status = Sidecar::default().status();
        assert_eq!(status.state, SidecarState::Starting);
        assert_eq!(status.error, None);
    }
}
