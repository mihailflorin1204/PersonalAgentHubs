import { LineDecoder } from "./line-decoder.js";
import {
  MAX_MESSAGE_BYTES,
  RUNTIME_VERSION,
  encodeOutbound,
  type OutboundMessage,
} from "./protocol.js";
import { createRuntime } from "./runtime.js";

const runtime = createRuntime({
  pid: process.pid,
  version: RUNTIME_VERSION,
  startedAt: Date.now(),
  now: () => Date.now(),
});
const decoder = new LineDecoder(MAX_MESSAGE_BYTES);
let stopping = false;

function send(message: OutboundMessage) {
  if (!stopping) {
    process.stdout.write(encodeOutbound(message));
  }
}

function stop(code: number) {
  if (stopping) {
    return;
  }
  stopping = true;
  process.exitCode = code;
  process.stdin.removeAllListeners("data");
  process.stdin.destroy();
  setTimeout(() => process.exit(code), 1_000).unref();
}

process.stdin.on("data", (chunk: Buffer) => {
  for (const line of decoder.push(chunk)) {
    const step = runtime.handle(line);
    for (const reply of step.replies) {
      send(reply);
    }
    if (step.shutdown) {
      stop(0);
      return;
    }
  }
});

// The parent owns the other end of stdin. When it exits or crashes the pipe
// closes, and the sidecar must not outlive it.
process.stdin.on("end", () => stop(0));
process.stdin.on("close", () => stop(0));
process.stdin.on("error", () => stop(1));
process.stdout.on("error", () => stop(1));

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
process.on("SIGHUP", () => stop(0));

send(runtime.ready());
