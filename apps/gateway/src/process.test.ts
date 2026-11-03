import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { beforeAll, expect, it } from "vitest";

const entry = fileURLToPath(new URL("../dist/index.js", import.meta.url));

beforeAll(() => {
  if (!existsSync(entry)) {
    throw new Error("run the gateway build before its process tests");
  }
});

async function freePort(): Promise<number> {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  probe.close();
  await once(probe, "close");
  if (address === null || typeof address === "string") {
    throw new Error("no free port");
  }
  return address.port;
}

function start(env: Record<string, string>): { child: ChildProcess; output: () => string } {
  let output = "";
  const child = spawn(process.execPath, [entry], {
    env: { ...env, SystemRoot: process.env.SystemRoot ?? "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  return { child, output: () => output };
}

async function waitForListening(output: () => string, child: ChildProcess) {
  const deadline = Date.now() + 10_000;
  while (!output().includes("listening on")) {
    if (child.exitCode !== null || Date.now() > deadline) {
      throw new Error("gateway did not start");
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

it("starts as its own process, answers health, and stops when signalled", async () => {
  const port = await freePort();
  const { child, output } = start({ GATEWAY_PORT: String(port) });
  try {
    await waitForListening(output, child);
    expect(output()).toContain(`mcp gateway listening on 127.0.0.1:${port}`);

    const health = await fetch(`http://127.0.0.1:${port}/health`);
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({ status: "ok" });

    const mcp = await fetch(`http://127.0.0.1:${port}/mcp`, { method: "POST" });
    expect(mcp.status).toBe(404);
  } finally {
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    await exited;
  }
  expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
}, 20_000);

it("exits non-zero on an invalid port without echoing it", async () => {
  const { child, output } = start({ GATEWAY_PORT: "not-a-port-secret" });
  const [code] = (await once(child, "exit")) as [number | null];
  expect(code).toBe(1);
  expect(output()).toContain("GATEWAY_PORT must be an integer");
  expect(output()).not.toContain("not-a-port-secret");
}, 20_000);
