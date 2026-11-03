import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ERROR_MESSAGES,
  RUNTIME_VERSION,
  inboundMessageSchema,
  outboundMessageSchema,
  parseInbound,
} from "./protocol.js";
import { createRuntime } from "./runtime.js";

function runtimeAt(now: number) {
  return createRuntime({ pid: 42, version: "1.2.3", startedAt: 1_000, now: () => now });
}

describe("protocol", () => {
  it("keeps the runtime version in step with package.json", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(RUNTIME_VERSION).toBe(manifest.version);
  });

  it("accepts only the known inbound shapes", () => {
    expect(parseInbound('{"type":"health","id":"h-1"}')).toEqual({ type: "health", id: "h-1" });
    expect(parseInbound('{"type":"shutdown"}')).toEqual({ type: "shutdown" });
  });

  it.each([
    ["not json", "process.exit(3)"],
    ["a bare string", '"health"'],
    ["null", "null"],
    ["an array", '[{"type":"health","id":"a"}]'],
    ["an unknown type", '{"type":"exec","command":"calc.exe"}'],
    ["an extra key", '{"type":"health","id":"a","command":"calc.exe"}'],
    ["a __proto__ key", '{"type":"health","id":"a","__proto__":{"polluted":true}}'],
    ["an id with shell characters", '{"type":"health","id":"a; rm -rf /"}'],
    ["an overlong id", `{"type":"health","id":"${"a".repeat(65)}"}`],
    ["a shutdown with arguments", '{"type":"shutdown","code":3}'],
  ])("rejects %s", (_label, line) => {
    expect(parseInbound(line)).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("does not accept unknown inbound types through the schema", () => {
    expect(inboundMessageSchema.safeParse({ type: "spawn", command: "sh" }).success).toBe(false);
  });
});

describe("runtime", () => {
  it("announces a ready message with a fixed shape", () => {
    const ready = runtimeAt(1_000).ready();
    expect(ready).toEqual({
      type: "ready",
      protocol: 1,
      name: "agenthub-local-runtime",
      version: "1.2.3",
      pid: 42,
    });
    expect(outboundMessageSchema.safeParse(ready).success).toBe(true);
  });

  it("answers a health request with its id and uptime", () => {
    expect(runtimeAt(1_250).handle({ kind: "line", text: '{"type":"health","id":"h-7"}' })).toEqual({
      replies: [{ type: "health", id: "h-7", status: "ok", uptimeMs: 250 }],
      shutdown: false,
    });
  });

  it("rejects malformed input with a fixed error that carries none of the input", () => {
    const payload = '{"type":"exec","command":"calc.exe"}';
    const step = runtimeAt(1_000).handle({ kind: "line", text: payload });
    expect(step).toEqual({
      replies: [{ type: "error", code: "invalid_message", message: ERROR_MESSAGES.invalid_message }],
      shutdown: false,
    });
    expect(JSON.stringify(step)).not.toContain("calc");
  });

  it("rejects an oversized line with a fixed error", () => {
    expect(runtimeAt(1_000).handle({ kind: "too_large" })).toEqual({
      replies: [{ type: "error", code: "message_too_large", message: "message too large" }],
      shutdown: false,
    });
  });

  it("asks to shut down on a shutdown message", () => {
    expect(runtimeAt(1_000).handle({ kind: "line", text: '{"type":"shutdown"}' })).toEqual({
      replies: [],
      shutdown: true,
    });
  });
});
