import { z } from "zod";

export const DEFAULT_GATEWAY_PORT = 3002;
export const DEFAULT_GATEWAY_HOST = "127.0.0.1";

export const INVALID_PORT_MESSAGE = "GATEWAY_PORT must be an integer from 0 to 65535";
export const INVALID_HOST_MESSAGE = "GATEWAY_HOST must be 127.0.0.1, ::1, 0.0.0.0, or ::";

const portSchema = z
  .string()
  .regex(/^\d{1,5}$/)
  .transform(Number)
  .pipe(z.number().int().min(0).max(65535));
const listenHostSchema = z.enum(["127.0.0.1", "::1", "0.0.0.0", "::"]);

export type GatewayConfig = {
  port: number;
  host: string;
};

function isUnset(value: string | undefined): value is undefined {
  return value === undefined || value.trim() === "";
}

export function resolveGatewayPort(value: string | undefined): number {
  if (isUnset(value)) {
    return DEFAULT_GATEWAY_PORT;
  }
  const parsed = portSchema.safeParse(value.trim());
  if (!parsed.success) {
    throw new Error(INVALID_PORT_MESSAGE);
  }
  return parsed.data;
}

/**
 * Loopback unless a deployment explicitly binds every interface.
 * Rejects hostnames so the process cannot be pointed at an unexpected address.
 */
export function resolveGatewayHost(value: string | undefined): string {
  if (isUnset(value)) {
    return DEFAULT_GATEWAY_HOST;
  }
  const parsed = listenHostSchema.safeParse(value.trim());
  if (!parsed.success) {
    throw new Error(INVALID_HOST_MESSAGE);
  }
  return parsed.data;
}

export function readGatewayConfig(env: NodeJS.ProcessEnv): GatewayConfig {
  return {
    port: resolveGatewayPort(env.GATEWAY_PORT),
    host: resolveGatewayHost(env.GATEWAY_HOST),
  };
}
