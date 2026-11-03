import { expect, it } from "vitest";
import {
  SHELL_UNREACHABLE,
  STATUS_UNRECOGNIZED,
  readSidecarStatus,
  type SidecarStatus,
} from "./sidecar-status";

const healthy: SidecarStatus = {
  state: "healthy",
  pid: 4242,
  version: "0.0.0",
  lastHealthAtMs: 1_790_000_000_000,
  exitCode: null,
  error: null,
};

it("asks the shell for the sidecar status only", async () => {
  const calls: string[] = [];
  const view = await readSidecarStatus(async (command) => {
    calls.push(command);
    return healthy;
  });
  expect(calls).toEqual(["sidecar_status"]);
  expect(view).toEqual({ kind: "status", status: healthy });
});

it("reports the shell as unreachable when invoke fails", async () => {
  const view = await readSidecarStatus(async () => {
    throw new Error("window.__TAURI_INTERNALS__ is undefined");
  });
  expect(view).toEqual({ kind: "unavailable", reason: SHELL_UNREACHABLE });
});

it.each([
  ["null", null],
  ["an unknown state", { ...healthy, state: "running" }],
  ["an extra field", { ...healthy, command: "node" }],
  ["a missing field", { state: "healthy" }],
  ["a non-integer pid", { ...healthy, pid: "4242" }],
])("does not show a status built from %s", async (_label, raw) => {
  expect(await readSidecarStatus(async () => raw)).toEqual({
    kind: "unavailable",
    reason: STATUS_UNRECOGNIZED,
  });
});
