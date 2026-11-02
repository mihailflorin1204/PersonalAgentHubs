import { probeDatabase } from "@agenthub/database";
import { createApp } from "./app.js";
import { resolveListenHost, resolvePort } from "./port.js";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

let port: number;
let host: string;
try {
  port = resolvePort(process.env.PORT);
  host = resolveListenHost(process.env.HOST);
} catch (error) {
  fail(error instanceof Error ? error.message : "listen address is invalid");
}

const app = createApp({
  resolveDatabaseStatus: () => probeDatabase(process.env.DATABASE_URL),
});

const server = app.listen(port, host, () => {
  console.log(`management api listening on ${host}:${port}`);
});

server.on("error", (error: NodeJS.ErrnoException) => {
  fail(error.message);
});

function shutdown() {
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
