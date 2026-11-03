import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { expect, it } from "vitest";
import { createApp } from "./app.js";

async function withApp(run: (baseUrl: string) => Promise<void>) {
  const server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

it("returns 200 JSON from the health check and nothing else", async () => {
  await withApp(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("x-powered-by")).toBeNull();
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});

it("has no MCP endpoint and no management routes yet", async () => {
  await withApp(async (baseUrl) => {
    for (const [method, path] of [
      ["POST", "/mcp"],
      ["GET", "/mcp"],
      ["POST", "/organizations"],
      ["GET", "/api/auth/get-session"],
      ["GET", "/unknown"],
    ] as const) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: method === "POST" ? { "content-type": "application/json" } : undefined,
        body: method === "POST" ? "{}" : undefined,
      });
      expect(response.status, `${method} ${path}`).toBe(404);
      await expect(response.json()).resolves.toEqual({ status: "not_found" });
    }
  });
});
