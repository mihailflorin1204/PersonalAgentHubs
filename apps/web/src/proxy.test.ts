import { expect, it } from "vitest";
import { latestOrganization, organizationCreateBody, readOrganization, readOrganizationList } from "./management.js";
import { authProxyPath, organizationProxyPath, proxyRequestHeaders, readApiOrigin } from "./management-api.js";

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

it("sends the management API its own origin and forwards the session cookie", () => {
  const headers = proxyRequestHeaders(
    new Headers({
      cookie: "session=abc",
      origin: "http://localhost:3000",
      host: "localhost:3000",
    }),
    "http://127.0.0.1:3001",
  );
  expect(headers.get("origin")).toBe("http://127.0.0.1:3001");
  expect(headers.get("host")).toBe("127.0.0.1:3001");
  expect(headers.get("cookie")).toBe("session=abc");
  expect(headers.get("referer")).toBe("http://127.0.0.1:3001/");
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
