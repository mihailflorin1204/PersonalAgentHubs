import { expect, it } from "vitest";
import {
  DEFAULT_GATEWAY_HOST,
  DEFAULT_GATEWAY_PORT,
  INVALID_HOST_MESSAGE,
  INVALID_PORT_MESSAGE,
  readGatewayConfig,
} from "./config.js";

it("listens on loopback port 3002 by default", () => {
  expect(readGatewayConfig({})).toEqual({ host: DEFAULT_GATEWAY_HOST, port: DEFAULT_GATEWAY_PORT });
  expect(readGatewayConfig({ GATEWAY_PORT: " ", GATEWAY_HOST: "" })).toEqual({ host: "127.0.0.1", port: 3002 });
});

it("accepts a valid port and an explicit bind address", () => {
  expect(readGatewayConfig({ GATEWAY_PORT: "4102", GATEWAY_HOST: "0.0.0.0" })).toEqual({
    host: "0.0.0.0",
    port: 4102,
  });
});

it("rejects an invalid port or host without echoing the value", () => {
  for (const value of ["abc", "-1", "65536", "3002; rm -rf /", "1e3"]) {
    expect(() => readGatewayConfig({ GATEWAY_PORT: value })).toThrow(INVALID_PORT_MESSAGE);
  }
  for (const value of ["example.com", "10.0.0.5", "localhost"]) {
    let message = "";
    try {
      readGatewayConfig({ GATEWAY_HOST: value });
    } catch (error) {
      message = error instanceof Error ? error.message : "";
    }
    expect(message).toBe(INVALID_HOST_MESSAGE);
    expect(message).not.toContain(value);
  }
});
