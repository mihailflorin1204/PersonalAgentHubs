import { expect, it } from "vitest";
import { resolveListenHost, resolvePort } from "./port.js";

it("defaults the listen port to 3001", () => {
  expect(resolvePort(undefined)).toBe(3001);
  expect(resolvePort("")).toBe(3001);
  expect(resolvePort("   ")).toBe(3001);
});

it("accepts an explicit port", () => {
  expect(resolvePort("4018")).toBe(4018);
  expect(resolvePort("0")).toBe(0);
});

it("defaults the listen host to loopback", () => {
  expect(resolveListenHost(undefined)).toBe("127.0.0.1");
  expect(resolveListenHost("")).toBe("127.0.0.1");
  expect(resolveListenHost("  127.0.0.1  ")).toBe("127.0.0.1");
});

it("accepts an explicit bind address for a container", () => {
  expect(resolveListenHost("0.0.0.0")).toBe("0.0.0.0");
  expect(resolveListenHost("::")).toBe("::");
});

it("rejects a hostname listen address", () => {
  expect(() => resolveListenHost("example.com")).toThrow(
    "HOST must be 127.0.0.1, ::1, 0.0.0.0, or ::",
  );
});

it("rejects a port that is not an integer in range", () => {
  expect(() => resolvePort("nope")).toThrow("PORT must be an integer from 0 to 65535");
  expect(() => resolvePort("-1")).toThrow("PORT must be an integer from 0 to 65535");
  expect(() => resolvePort("65536")).toThrow("PORT must be an integer from 0 to 65535");
  expect(() => resolvePort("4018abc")).toThrow("PORT must be an integer from 0 to 65535");
});
