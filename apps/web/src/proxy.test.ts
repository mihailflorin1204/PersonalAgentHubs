import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { latestOrganization, organizationCreateBody, readOrganization, readOrganizationList } from "./management.js";
import {
  authProxyPath,
  forwardToManagement,
  isAllowedOrigin,
  organizationProxyPath,
  proxyRequestHeaders,
  readApiOrigin,
  readWebOrigins,
} from "./management-api.js";

it("rejects an API origin that carries credentials", () => {
  expect(() => readApiOrigin("http://user:secret@127.0.0.1:3001")).toThrow("API_URL is invalid");
  expect(readApiOrigin(undefined)).toBe("http://127.0.0.1:3001");
});

it("keeps the auth proxy on the management auth path", () => {
  expect(authProxyPath(["sign-in", "email"])).toBe("/api/auth/sign-in/email");
  expect(authProxyPath(["..", "organizations"])).toBeNull();
  expect(authProxyPath([])).toBeNull();
  expect(organizationProxyPath()).toBe("/organizations");
  expect(organizationProxyPath("..")).toBeNull();
});

it("forwards the browser origin, referer, and session cookie unchanged and drops host", () => {
  const headers = proxyRequestHeaders(
    new Headers({
      cookie: "session=abc",
      origin: "http://localhost:3000",
      referer: "http://localhost:3000/",
      host: "localhost:3000",
      expect: "100-continue",
    }),
  );
  expect(headers.get("origin")).toBe("http://localhost:3000");
  expect(headers.get("referer")).toBe("http://localhost:3000/");
  expect(headers.get("cookie")).toBe("session=abc");
  expect(headers.get("host")).toBeNull();
  expect(headers.get("expect")).toBeNull();
  const spoofed = proxyRequestHeaders(
    new Headers({
      "x-forwarded-for": "203.0.113.7",
      "x-forwarded-host": "evil.example",
      "x-real-ip": "203.0.113.8",
      forwarded: "for=203.0.113.9",
    }),
  );
  expect([...spoofed.keys()]).toEqual([]);
});

it("reads the console origin from the request URL unless WEB_ORIGINS is set", () => {
  expect(readWebOrigins(undefined, "http://localhost:3000/organizations")).toEqual([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);
  expect(readWebOrigins(" ", "http://127.0.0.1:3005/organizations")).toEqual([
    "http://localhost:3005",
    "http://127.0.0.1:3005",
  ]);
  expect(readWebOrigins(undefined, "https://console.example.com/organizations")).toEqual([
    "https://console.example.com",
  ]);
  expect(readWebOrigins("http://localhost:3000, http://127.0.0.1:3000", "http://0.0.0.0:3000/")).toEqual([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);
  expect(() => readWebOrigins("http://user:secret@localhost:3000", "http://localhost:3000/")).toThrow(
    "WEB_ORIGINS is invalid",
  );
  expect(() => readWebOrigins("http://localhost:3000,", "http://localhost:3000/")).toThrow("WEB_ORIGINS is invalid");
  expect(() => readWebOrigins("javascript:alert(1)", "http://localhost:3000/")).toThrow("WEB_ORIGINS is invalid");
  expect(isAllowedOrigin("null", ["http://localhost:3000"])).toBe(false);
  expect(isAllowedOrigin(null, ["http://localhost:3000"])).toBe(false);
});

describe("forwardToManagement", () => {
  const upstream = vi.fn<typeof fetch>();

  beforeEach(() => {
    upstream.mockReset();
    upstream.mockResolvedValue(Response.json({ ok: true }, { status: 200 }));
    vi.stubGlobal("fetch", upstream);
    vi.stubEnv("API_URL", "http://127.0.0.1:3001");
    vi.stubEnv("WEB_ORIGINS", "");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function post(headers: Record<string, string>) {
    return new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ email: "a@example.com", password: "password123" }),
    });
  }

  it("rejects a POST from a foreign origin without calling the API", async () => {
    const response = await forwardToManagement(post({ origin: "https://evil.example" }), "/api/auth/sign-in/email");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ status: "forbidden" });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rejects a POST with no origin without calling the API", async () => {
    const response = await forwardToManagement(post({}), "/api/auth/sign-in/email");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ status: "forbidden" });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("accepts the other loopback name on the same port and rejects another port", async () => {
    const otherPort = await forwardToManagement(post({ origin: "http://127.0.0.1:4000" }), "/api/auth/sign-in/email");
    expect(otherPort.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();

    const alias = await forwardToManagement(post({ origin: "http://127.0.0.1:3000" }), "/api/auth/sign-in/email");
    expect(alias.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("allows only the WEB_ORIGINS list when it is set", async () => {
    vi.stubEnv("WEB_ORIGINS", "https://console.example.com");
    const loopback = await forwardToManagement(post({ origin: "http://localhost:3000" }), "/api/auth/sign-in/email");
    expect(loopback.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("forwards a same-origin POST with its origin unchanged", async () => {
    const response = await forwardToManagement(
      post({ origin: "http://localhost:3000", referer: "http://localhost:3000/" }),
      "/api/auth/sign-in/email",
    );
    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(1);
    const [target, init] = upstream.mock.calls[0]!;
    expect(String(target)).toBe("http://127.0.0.1:3001/api/auth/sign-in/email");
    const headers = new Headers(init?.headers);
    expect(headers.get("origin")).toBe("http://localhost:3000");
    expect(headers.get("referer")).toBe("http://localhost:3000/");
    expect(headers.get("host")).toBeNull();
  });

  it("returns unavailable when the management API cannot be reached", async () => {
    upstream.mockRejectedValue(new TypeError("fetch failed"));
    const response = await forwardToManagement(
      new Request("http://localhost:3000/organizations"),
      "/organizations",
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });

  it("forwards a GET without requiring an origin", async () => {
    const response = await forwardToManagement(
      new Request("http://localhost:3000/organizations", { headers: { cookie: "session=abc" } }),
      "/organizations",
    );
    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(1);
    const [target, init] = upstream.mock.calls[0]!;
    expect(String(target)).toBe("http://127.0.0.1:3001/organizations");
    expect(init?.method).toBe("GET");
    expect(new Headers(init?.headers).get("cookie")).toBe("session=abc");
  });
});

it("accepts an organization name and reads the name back from the API shape", () => {
  expect(organizationCreateBody("  Northwind  ")).toEqual({ name: "Northwind" });
  expect(organizationCreateBody("   ")).toBeNull();
  expect(readOrganization({ id: "org_1", name: "Northwind", createdAt: "2026-11-02T00:00:00.000Z" })).toEqual({
    id: "org_1",
    name: "Northwind",
    createdAt: "2026-11-02T00:00:00.000Z",
  });
  expect(readOrganizationList({ organizations: [{ id: "org_1", name: "Northwind" }] })).toEqual([
    { id: "org_1", name: "Northwind" },
  ]);
  expect(readOrganization({ id: "org_1" })).toBeNull();
  expect(
    latestOrganization([
      { id: "org_1", name: "Older", createdAt: "2026-11-01T00:00:00.000Z" },
      { id: "org_2", name: "Newer", createdAt: "2026-11-02T00:00:00.000Z" },
    ])?.name,
  ).toBe("Newer");
});
