import { z } from "zod";

export const PROTOCOL_VERSION = 1;
export const RUNTIME_NAME = "agenthub-local-runtime";
export const RUNTIME_VERSION = "0.0.0";
export const MAX_MESSAGE_BYTES = 64 * 1024;

const requestIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

export const inboundMessageSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("health"), id: requestIdSchema }),
  z.strictObject({ type: z.literal("shutdown") }),
]);

export type InboundMessage = z.infer<typeof inboundMessageSchema>;

export const errorCodeSchema = z.enum(["invalid_message", "message_too_large"]);

export type ErrorCode = z.infer<typeof errorCodeSchema>;

/** Fixed text per code. Rejections never carry any part of the offending input. */
export const ERROR_MESSAGES: Readonly<Record<ErrorCode, string>> = {
  invalid_message: "message rejected",
  message_too_large: "message too large",
};

export const outboundMessageSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("ready"),
    protocol: z.literal(PROTOCOL_VERSION),
    name: z.literal(RUNTIME_NAME),
    version: z.string(),
    pid: z.number().int().positive(),
  }),
  z.strictObject({
    type: z.literal("health"),
    id: requestIdSchema,
    status: z.literal("ok"),
    uptimeMs: z.number().int().nonnegative(),
  }),
  z.strictObject({
    type: z.literal("error"),
    code: errorCodeSchema,
    message: z.string(),
  }),
]);

export type OutboundMessage = z.infer<typeof outboundMessageSchema>;

/** Parses one line as data only. Anything that is not a known message is undefined. */
export function parseInbound(line: string): InboundMessage | undefined {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return undefined;
  }
  const parsed = inboundMessageSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function errorMessage(code: ErrorCode): OutboundMessage {
  return { type: "error", code, message: ERROR_MESSAGES[code] };
}

export function encodeOutbound(message: OutboundMessage): string {
  return `${JSON.stringify(outboundMessageSchema.parse(message))}\n`;
}
