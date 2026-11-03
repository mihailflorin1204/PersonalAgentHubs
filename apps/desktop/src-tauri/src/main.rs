#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod sidecar;

use sidecar::{Launch, Sidecar, SidecarStatus};
use tauri::{Manager, RunEvent, State};

#[tauri::command]
fn sidecar_status(sidecar: State<'_, Sidecar>) -> SidecarStatus {
    sidecar.status()
}

fn main() {
    let app = tauri::Builder::default()
        .manage(Sidecar::default())
        .setup(|app| {
            let launch = Launch::resolve(app.handle());
            app.state::<Sidecar>().start(launch);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![sidecar_status])
        .build(tauri::generate_context!())
        .expect("failed to build the AgentHub desktop app");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            handle.state::<Sidecar>().stop();
        }
    });
}
