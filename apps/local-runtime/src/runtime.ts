import type { DecodedLine } from "./line-decoder.js";
import {
  PROTOCOL_VERSION,
  RUNTIME_NAME,
  errorMessage,
  parseInbound,
  type OutboundMessage,
} from "./protocol.js";

export interface RuntimeOptions {
  pid: number;
  version: string;
  startedAt: number;
  now: () => number;
}

export interface RuntimeStep {
  replies: OutboundMessage[];
  shutdown: boolean;
}

export interface Runtime {
  ready(): OutboundMessage;
  handle(input: DecodedLine): RuntimeStep;
}

export function createRuntime(options: RuntimeOptions): Runtime {
  return {
    ready() {
      return {
        type: "ready",
        protocol: PROTOCOL_VERSION,
        name: RUNTIME_NAME,
        version: options.version,
        pid: options.pid,
      };
    },

    handle(input) {
      if (input.kind === "too_large") {
        return { replies: [errorMessage("message_too_large")], shutdown: false };
      }

      const message = parseInbound(input.text);
      if (!message) {
        return { replies: [errorMessage("invalid_message")], shutdown: false };
      }

      switch (message.type) {
        case "health":
          return {
            replies: [
              {
                type: "health",
                id: message.id,
                status: "ok",
                uptimeMs: Math.max(0, Math.floor(options.now() - options.startedAt)),
              },
            ],
            shutdown: false,
          };
        case "shutdown":
          return { replies: [], shutdown: true };
      }
    },
  };
}
