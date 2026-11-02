import { z } from "zod";

const portSchema = z.string().regex(/^\d+$/);
const listenHostSchema = z.enum(["127.0.0.1", "::1", "0.0.0.0", "::"]);

export function resolvePort(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return 3001;
  }

  const parsed = portSchema.safeParse(value.trim());
  if (!parsed.success) {
    throw new Error("PORT must be an integer from 0 to 65535");
  }

  const port = Number(parsed.data);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("PORT must be an integer from 0 to 65535");
  }

  return port;
}

/**
 * Loopback unless a deployment explicitly binds every interface.
 * Rejects hostnames so the process cannot be pointed at an unexpected address.
 */
export function resolveListenHost(value: string | undefined): string {
  if (value === undefined || value.trim() === "") {
    return "127.0.0.1";
  }

  const parsed = listenHostSchema.safeParse(value.trim());
  if (!parsed.success) {
    throw new Error("HOST must be 127.0.0.1, ::1, 0.0.0.0, or ::");
  }

  return parsed.data;
}
