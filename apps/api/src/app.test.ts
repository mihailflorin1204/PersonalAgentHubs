import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { expect, it } from "vitest";
import { createApp, type CreateAppOptions } from "./app.js";

async function withApp(
  resolveDatabaseStatus: CreateAppOptions["resolveDatabaseStatus"],
  run: (baseUrl: string) => Promise<void>,
) {
  const app = createApp({ resolveDatabaseStatus });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

it("returns 200 JSON and does not claim the database is connected when it is unconfigured", async () => {
  await withApp(
    () => "unconfigured",
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");
      await expect(response.json()).resolves.toEqual({
        status: "ok",
        database: "unconfigured",
      });
    },
  );
});

it("reports an unreachable database without calling it connected", async () => {
  await withApp(
    () => "unreachable",
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        status: "ok",
        database: "unreachable",
      });
    },
  );
});

it("reports connected only when the probe says the database accepted a query", async () => {
  await withApp(
    () => "connected",
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        status: "ok",
        database: "connected",
      });
    },
  );
});

it("denies organization creation and reads when no session is configured, and health stays open", async () => {
  await withApp(
    () => "connected",
    async (baseUrl) => {
      const health = await fetch(`${baseUrl}/health`);
      expect(health.status).toBe(200);
      await expect(health.json()).resolves.toEqual({
        status: "ok",
        database: "connected",
      });

      const created = await fetch(`${baseUrl}/organizations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Hidden" }),
      });
      expect(created.status).toBe(401);
      await expect(created.json()).resolves.toEqual({ status: "unauthorized" });

      const listed = await fetch(`${baseUrl}/organizations`);
      expect(listed.status).toBe(401);
      await expect(listed.json()).resolves.toEqual({ status: "unauthorized" });
    },
  );
});

it("does not leak a connection string when status cannot be resolved", async () => {
  await withApp(
    async () => {
      throw new Error("failed postgresql://user:secret@127.0.0.1:5432/agenthub");
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health`);
      expect(response.status).toBe(500);
      const body: unknown = await response.json();
      expect(body).toEqual({ status: "error" });
      expect(JSON.stringify(body)).not.toContain("secret");
      expect(JSON.stringify(body)).not.toContain("connected");
    },
  );
});
