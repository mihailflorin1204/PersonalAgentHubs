import { createApp } from "./app.js";
import { readGatewayConfig, type GatewayConfig } from "./config.js";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

let config: GatewayConfig;
try {
  config = readGatewayConfig(process.env);
} catch (error) {
  fail(error instanceof Error ? error.message : "gateway configuration is invalid");
}

const { host, port } = config;
const server = createApp().listen(port, host, () => {
  console.log(`mcp gateway listening on ${host}:${port}`);
});

server.on("error", (error: NodeJS.ErrnoException) => {
  fail(error.code === "EADDRINUSE" ? "gateway port is already in use" : "gateway failed to listen");
});

function shutdown() {
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
