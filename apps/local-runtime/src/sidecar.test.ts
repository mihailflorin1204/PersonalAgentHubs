import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { sidecarNodeArgs } from "./launch.js";
import { MAX_MESSAGE_BYTES, outboundMessageSchema } from "./protocol.js";

const sidecarPath = fileURLToPath(new URL("../dist/sidecar.mjs", import.meta.url));

function sidecarEnv(): NodeJS.ProcessEnv {
  return process.platform === "win32" && process.env.SystemRoot
    ? { SystemRoot: process.env.SystemRoot }
    : {};
}

async function within<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

class SidecarProcess {
  readonly child: ChildProcessWithoutNullStreams;
  readonly lines: string[] = [];
  readonly exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  stderr = "";
  #cursor = 0;
  #wake: (() => void) | undefined;

  constructor(args: string[]) {
    this.child = spawn(process.execPath, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: sidecarEnv(),
      windowsHide: true,
    });
    let buffered = "";
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => {
      buffered += chunk;
      let newline = buffered.indexOf("\n");
      while (newline !== -1) {
        this.lines.push(buffered.slice(0, newline));
        buffered = buffered.slice(newline + 1);
        newline = buffered.indexOf("\n");
      }
      this.#wake?.();
    });
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk: string) => {
      this.stderr += chunk;
    });
    this.exited = new Promise((resolve) => {
      this.child.once("exit", (code, signal) => resolve({ code, signal }));
    });
  }

  send(line: string | Buffer) {
    this.child.stdin.write(line);
    this.child.stdin.write("\n");
  }

  async next(): Promise<unknown> {
    const read = async () => {
      while (this.#cursor >= this.lines.length) {
        await new Promise<void>((resolve) => {
          this.#wake = resolve;
        });
      }
      const line = this.lines[this.#cursor++] as string;
      const parsed: unknown = JSON.parse(line);
      expect(outboundMessageSchema.safeParse(parsed).success).toBe(true);
      return parsed;
    };
    return within(read(), 5_000, `sidecar output (stderr: ${this.stderr})`);
  }

  async exit() {
    return within(this.exited, 5_000, "sidecar exit");
  }
}

const running: SidecarProcess[] = [];

afterEach(() => {
  for (const sidecar of running.splice(0)) {
    if (sidecar.child.exitCode === null && sidecar.child.signalCode === null) {
      sidecar.child.kill();
    }
  }
});

describe.each([
  ["with the desktop launch flags", () => sidecarNodeArgs(sidecarPath)],
  ["under plain node", () => [sidecarPath]],
])("built sidecar %s", (_label, args) => {
  function start() {
    expect(existsSync(sidecarPath)).toBe(true);
    const sidecar = new SidecarProcess(args());
    running.push(sidecar);
    return sidecar;
  }

  it("reports ready and healthy", async () => {
    const sidecar = start();
    expect(await sidecar.next()).toEqual({
      type: "ready",
      protocol: 1,
      name: "agenthub-local-runtime",
      version: "0.0.0",
      pid: sidecar.child.pid,
    });

    sidecar.send('{"type":"health","id":"boot-1"}');
    expect(await sidecar.next()).toMatchObject({ type: "health", id: "boot-1", status: "ok" });

    sidecar.child.stdin.end();
    expect(await sidecar.exit()).toEqual({ code: 0, signal: null });
  });

  it("exits when stdin closes", async () => {
    const sidecar = start();
    await sidecar.next();
    sidecar.child.stdin.end();
    expect(await sidecar.exit()).toEqual({ code: 0, signal: null });
  });

  it("exits on a shutdown message", async () => {
    const sidecar = start();
    await sidecar.next();
    sidecar.send('{"type":"shutdown"}');
    expect(await sidecar.exit()).toEqual({ code: 0, signal: null });
  });

  it.skipIf(process.platform === "win32")("exits on SIGTERM", async () => {
    const sidecar = start();
    await sidecar.next();
    sidecar.child.kill("SIGTERM");
    expect(await sidecar.exit()).toEqual({ code: 0, signal: null });
  });

  it("rejects malformed input without evaluating or echoing it", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "agenthub-sidecar-"));
    const marker = join(scratch, "evaluated");
    try {
      const sidecar = start();
      await sidecar.next();

      const malformed: Array<string | Buffer> = [
        'process.stdout.write("PWNED\\n")',
        `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "x")`,
        '{"type":"eval","code":"process.stdout.write(\'PWNED\')"}',
        '{"type":"exec","command":"calc.exe","args":["PWNED"]}',
        '{"type":"health","id":"ok","command":"PWNED"}',
        '{"type":"health","id":"$(PWNED)"}',
        '{"type":"health","id":"a","__proto__":{"PWNED":true}}',
        '{"type":"health"',
        Buffer.from([0xff, 0xfe, 0xfd]),
      ];
      for (const line of malformed) {
        sidecar.send(line);
      }
      for (const _line of malformed) {
        expect(await sidecar.next()).toEqual({
          type: "error",
          code: "invalid_message",
          message: "message rejected",
        });
      }

      sidecar.send(`{"type":"health","id":"${"P".repeat(MAX_MESSAGE_BYTES + 1)}"}`);
      expect(await sidecar.next()).toEqual({
        type: "error",
        code: "message_too_large",
        message: "message too large",
      });

      sidecar.send('{"type":"health","id":"after"}');
      expect(await sidecar.next()).toMatchObject({ type: "health", id: "after", status: "ok" });

      expect(sidecar.child.exitCode).toBeNull();
      expect(existsSync(marker)).toBe(false);
      const output = sidecar.lines.join("\n");
      expect(output).not.toContain("PWNED");
      expect(output).not.toContain("calc");
      expect(output).not.toContain(marker);
      expect(sidecar.lines).toHaveLength(malformed.length + 3);

      sidecar.child.stdin.end();
      expect(await sidecar.exit()).toEqual({ code: 0, signal: null });
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});
