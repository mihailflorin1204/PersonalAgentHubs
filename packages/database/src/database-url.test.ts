import { expect, it } from "vitest";
import { readDatabaseUrl, redactConnectionString, requireDatabaseUrl } from "./database-url.js";

it("treats a missing or blank database url as unset", () => {
  expect(readDatabaseUrl(undefined)).toBeUndefined();
  expect(readDatabaseUrl("")).toBeUndefined();
  expect(readDatabaseUrl("   ")).toBeUndefined();
});

it("returns a trimmed database url", () => {
  expect(readDatabaseUrl("  postgresql://localhost/agenthub  ")).toBe(
    "postgresql://localhost/agenthub",
  );
});

it("fails closed when migrations have no database url", () => {
  expect(() => requireDatabaseUrl(undefined)).toThrow(
    "DATABASE_URL is required to run migrations",
  );
  expect(() => requireDatabaseUrl("  ")).toThrow("DATABASE_URL is required to run migrations");
});

it("removes connection strings from error text", () => {
  const message = redactConnectionString(
    "connect failed for postgresql://user:secret@127.0.0.1:5432/agenthub extra",
  );
  expect(message).toBe("connect failed for [redacted] extra");
  expect(message).not.toContain("secret");
});
