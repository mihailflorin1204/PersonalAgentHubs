import { expect, it } from "vitest";
import { probeDatabase } from "./client.js";

it("does not report a database connection when the url is missing", async () => {
  expect(await probeDatabase(undefined)).toBe("unconfigured");
  expect(await probeDatabase("")).toBe("unconfigured");
  expect(await probeDatabase("   ")).toBe("unconfigured");
});

it(
  "does not report a database connection when PostgreSQL refuses it",
  async () => {
    const status = await probeDatabase("postgresql://127.0.0.1:1/agenthub");
    expect(status).toBe("unreachable");
  },
  15_000,
);
