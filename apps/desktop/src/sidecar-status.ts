import { z } from "zod";

export const sidecarStateSchema = z.enum(["starting", "healthy", "unhealthy", "stopped", "failed"]);

export type SidecarState = z.infer<typeof sidecarStateSchema>;

/** Mirrors `SidecarStatus` in src-tauri/src/sidecar.rs. */
export const sidecarStatusSchema = z.strictObject({
  state: sidecarStateSchema,
  pid: z.number().int().positive().nullable(),
  version: z.string().max(64).nullable(),
  lastHealthAtMs: z.number().int().nonnegative().nullable(),
  exitCode: z.number().int().nullable(),
  error: z.string().max(200).nullable(),
});

export type SidecarStatus = z.infer<typeof sidecarStatusSchema>;

export type SidecarView =
  | { kind: "status"; status: SidecarStatus }
  | { kind: "unavailable"; reason: string };

export type Invoke = (command: "sidecar_status") => Promise<unknown>;

export const SHELL_UNREACHABLE = "The desktop shell is not reachable.";
export const STATUS_UNRECOGNIZED = "The desktop shell returned an unrecognized status.";

export async function readSidecarStatus(invoke: Invoke): Promise<SidecarView> {
  let raw: unknown;
  try {
    raw = await invoke("sidecar_status");
  } catch {
    return { kind: "unavailable", reason: SHELL_UNREACHABLE };
  }
  const parsed = sidecarStatusSchema.safeParse(raw);
  if (!parsed.success) {
    return { kind: "unavailable", reason: STATUS_UNRECOGNIZED };
  }
  return { kind: "status", status: parsed.data };
}
