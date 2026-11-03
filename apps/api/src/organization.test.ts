import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { authNodeHandler, createAuth, readSession } from "@agenthub/auth";
import {
  countSessionsForUser,
  createOrganizationForMember,
  credentialPasswordHash,
  getOrganization,
  getOrganizationForMember,
  listMembershipsForOrganization,
  listOrganizationsForMember,
  openDatabase,
  removeUserByEmail,
  runMigrations,
  type OpenDatabase,
} from "@agenthub/database";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createApp } from "./app.js";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/agenthub";
const authSecret = "ren-6-test-secret-must-be-32-characters";
const password = "ren6-sign-in-password";

let database: OpenDatabase;
let baseUrl = "";
let closeServer: () => Promise<void> = async () => {};

beforeAll(async () => {
  await runMigrations(databaseUrl);
  database = openDatabase(databaseUrl);
  const auth = createAuth({
    database: database.db,
    secret: authSecret,
    trustedOrigins: ["http://127.0.0.1:*"],
    rateLimitEnabled: false,
  });
  const app = createApp({
    resolveDatabaseStatus: () => "connected",
    auth: {
      handler: authNodeHandler(auth),
      readSession: (headers) => readSession(auth, headers),
    },
    createOrganization: (input) => createOrganizationForMember(database.db, input),
    listOrganizations: (userId) => listOrganizationsForMember(database.db, userId),
    getOrganizationForMember: (userId, organizationId) =>
      getOrganizationForMember(database.db, organizationId, userId),
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
  closeServer = async () => {
    server.close();
    await once(server, "close");
  };
}, 30_000);

afterAll(async () => {
  await closeServer();
  await database?.close();
});

function emailAddress(): string {
  return `ren6-${randomUUID()}@example.com`;
}

function sessionCookie(response: Response): string | undefined {
  const cookies =
    typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  return cookies
    .map((cookie) => cookie.split(";")[0] ?? "")
    .find((cookie) => cookie.startsWith("better-auth.session_token="));
}

async function signUp(email: string, name: string): Promise<{ id: string }> {
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: baseUrl,
    },
    body: JSON.stringify({ email, password, name }),
  });
  if (response.status !== 200) {
    throw new Error(`sign-up failed with status ${response.status}`);
  }
  const body: unknown = await response.json();
  if (!isUserBody(body) || body.user?.id === undefined) {
    throw new Error("sign-up did not return a user id");
  }
  expect(body.token).toBeNull();
  expect(JSON.stringify(body.user)).not.toContain(password);
  return { id: body.user.id };
}

async function signIn(email: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: baseUrl,
    },
    body: JSON.stringify({ email, password }),
  });
  if (response.status !== 200) {
    throw new Error(`sign-in failed with status ${response.status}`);
  }
  const cookie = sessionCookie(response);
  if (!cookie) {
    throw new Error("sign-in did not set a session cookie");
  }
  const body: unknown = await response.json();
  if (!isUserBody(body)) {
    throw new Error("sign-in did not return a user");
  }
  expect(JSON.stringify(body.user)).not.toContain(password);
  return cookie;
}

function isUserBody(value: unknown): value is { token: string | null; user?: { id?: string } } {
  return typeof value === "object" && value !== null && "user" in value;
}

async function sessionUserId(cookie: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/auth/get-session`, {
    headers: { cookie, origin: baseUrl },
  });
  expect(response.status).toBe(200);
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null) {
    throw new Error("session response was empty");
  }
  const record = body as { session?: { id?: unknown; userId?: unknown }; user?: { id?: unknown } };
  expect(typeof record.session?.id).toBe("string");
  expect(record.session?.userId).toBe(record.user?.id);
  if (typeof record.session?.userId !== "string") {
    throw new Error("session did not include a user id");
  }
  return record.session.userId;
}

it("sign-in creates a session", async () => {
  const email = emailAddress();
  try {
    const user = await signUp(email, "Ren Six");
    expect(await countSessionsForUser(database.db, user.id)).toBe(0);

    const cookie = await signIn(email);
    const sessionUser = await sessionUserId(cookie);
    expect(sessionUser).toBe(user.id);
    expect(await countSessionsForUser(database.db, user.id)).toBe(1);

    const hash = await credentialPasswordHash(database.db, user.id);
    expect(hash).toEqual(expect.any(String));
    expect(hash).not.toBe(password);
    expect(hash ?? "").not.toContain(password);
  } finally {
    await removeUserByEmail(database.db, email);
  }
}, 30_000);

it("create-organization returns the new organization", async () => {
  const email = emailAddress();
  try {
    const user = await signUp(email, "Org Owner");
    const cookie = await signIn(email);
    const suppliedId = "11111111-1111-4111-8111-111111111111";
    const response = await fetch(`${baseUrl}/organizations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
        origin: baseUrl,
      },
      body: JSON.stringify({ name: "Northwind", organizationId: suppliedId }),
    });
    expect(response.status).toBe(201);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ name: "Northwind" });
    if (!isOrganization(body)) {
      throw new Error("create-organization did not return an organization");
    }
    expect(body.id).not.toBe(suppliedId);
    expect(body.createdAt).toEqual(expect.any(String));

    const stored = await getOrganization(database.db, body.id);
    expect(stored?.name).toBe("Northwind");
    const memberships = await listMembershipsForOrganization(database.db, body.id);
    expect(memberships).toEqual([
      expect.objectContaining({ userId: user.id, role: "owner", organizationId: body.id }),
    ]);

    const visible = await listOrganizationsForMember(database.db, user.id);
    expect(visible.map((organization) => organization.id)).toEqual([body.id]);
  } finally {
    await removeUserByEmail(database.db, email);
  }
}, 30_000);

it("a second organization is not visible from the first session's queries", async () => {
  const emailA = emailAddress();
  const emailB = emailAddress();
  try {
    await signUp(emailA, "Person A");
    await signUp(emailB, "Person B");
    const cookieA = await signIn(emailA);
    const cookieB = await signIn(emailB);
    const userA = await sessionUserId(cookieA);
    const userB = await sessionUserId(cookieB);

    const createdA = await createOrganization(cookieA, "Alpha");
    const createdB = await createOrganization(cookieB, "Beta");
    expect(createdA.id).not.toBe(createdB.id);
    expect((await getOrganization(database.db, createdB.id))?.name).toBe("Beta");

    const listA = await fetch(`${baseUrl}/organizations`, {
      headers: { cookie: cookieA, origin: baseUrl },
    });
    expect(listA.status).toBe(200);
    const listBody: unknown = await listA.json();
    expect(listBody).toEqual({
      organizations: [expect.objectContaining({ id: createdA.id, name: "Alpha" })],
    });
    expect(JSON.stringify(listBody)).not.toContain(createdB.id);
    expect(JSON.stringify(listBody)).not.toContain("Beta");

    const direct = await fetch(`${baseUrl}/organizations/${createdB.id}`, {
      headers: { cookie: cookieA, origin: baseUrl },
    });
    expect(direct.status).toBe(404);
    await expect(direct.json()).resolves.toEqual({ status: "not_found" });

    const queryA = await listOrganizationsForMember(database.db, userA);
    expect(queryA.map((organization) => organization.id)).toEqual([createdA.id]);
    expect(await getOrganizationForMember(database.db, createdB.id, userA)).toBeNull();

    const listB = await fetch(`${baseUrl}/organizations`, {
      headers: { cookie: cookieB, origin: baseUrl },
    });
    const listBBody: unknown = await listB.json();
    expect(listBBody).toEqual({
      organizations: [expect.objectContaining({ id: createdB.id, name: "Beta" })],
    });
    expect(JSON.stringify(listBBody)).not.toContain(createdA.id);
    expect(await getOrganizationForMember(database.db, createdA.id, userB)).toBeNull();
  } finally {
    await removeUserByEmail(database.db, emailA);
    await removeUserByEmail(database.db, emailB);
  }
}, 30_000);

it("a missing or invalid session denies organization creation and tenant reads", async () => {
  const email = emailAddress();
  try {
    await signUp(email, "Closed");
    const cookie = await signIn(email);
    const created = await createOrganization(cookie, "Visible");

    const anonymous = await fetch(`${baseUrl}/organizations`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseUrl },
      body: JSON.stringify({ name: "Nope" }),
    });
    expect(anonymous.status).toBe(401);
    await expect(anonymous.json()).resolves.toEqual({ status: "unauthorized" });

    const invalid = await fetch(`${baseUrl}/organizations/${created.id}`, {
      headers: { cookie: "better-auth.session_token=not-a-session", origin: baseUrl },
    });
    expect(invalid.status).toBe(401);

    const health = await fetch(`${baseUrl}/health`);
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({ status: "ok", database: "connected" });
  } finally {
    await removeUserByEmail(database.db, email);
  }
}, 30_000);

async function createOrganization(cookie: string, name: string): Promise<{ id: string; name: string }> {
  const response = await fetch(`${baseUrl}/organizations`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie,
      origin: baseUrl,
    },
    body: JSON.stringify({ name }),
  });
  if (response.status !== 201) {
    throw new Error(`create-organization failed with status ${response.status}`);
  }
  const body: unknown = await response.json();
  if (!isOrganization(body)) {
    throw new Error("create-organization did not return an organization");
  }
  return body;
}

function isOrganization(value: unknown): value is { id: string; name: string; createdAt: string } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as { id?: unknown; name?: unknown; createdAt?: unknown };
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.createdAt === "string"
  );
}
