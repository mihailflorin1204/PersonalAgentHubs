import {
  createOrganizationForMember,
  getOrganizationForMember,
  listOrganizationsForMember,
  openDatabase,
  probeDatabase,
  readDatabaseUrl,
  type OpenDatabase,
} from "@agenthub/database";
import { authNodeHandler, createAuth, readSession } from "@agenthub/auth";
import { createApp, type AuthAdapter } from "./app.js";
import { resolveListenHost, resolvePort } from "./port.js";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function readBaseURL(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("BETTER_AUTH_URL is invalid");
  }
  if (
    url.username !== "" ||
    url.password !== "" ||
    (url.protocol !== "http:" && url.protocol !== "https:")
  ) {
    throw new Error("BETTER_AUTH_URL is invalid");
  }
  return url.origin;
}

function readTrustedOrigins(value: string | undefined): string[] | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }
  const origins = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  if (origins.some((origin) => origin.includes("://") && origin.includes("@"))) {
    throw new Error("BETTER_AUTH_TRUSTED_ORIGINS is invalid");
  }
  return origins.length > 0 ? origins : undefined;
}

let port: number;
let host: string;
try {
  port = resolvePort(process.env.PORT);
  host = resolveListenHost(process.env.HOST);
} catch (error) {
  fail(error instanceof Error ? error.message : "listen address is invalid");
}

const databaseUrl = readDatabaseUrl(process.env.DATABASE_URL);
let database: OpenDatabase | undefined;
let auth: AuthAdapter | undefined;

if (databaseUrl && process.env.BETTER_AUTH_SECRET) {
  let opened: OpenDatabase | undefined;
  try {
    opened = openDatabase(databaseUrl);
    const configured = createAuth({
      database: opened.db,
      secret: process.env.BETTER_AUTH_SECRET,
      baseURL: readBaseURL(process.env.BETTER_AUTH_URL),
      trustedOrigins: readTrustedOrigins(process.env.BETTER_AUTH_TRUSTED_ORIGINS),
    });
    database = opened;
    auth = {
      handler: authNodeHandler(configured),
      readSession: (headers) => readSession(configured, headers),
    };
  } catch {
    console.error("authentication is unavailable");
    if (opened) {
      void opened.close();
    }
    database = undefined;
    auth = undefined;
  }
}

const activeDatabase = database;

const app = createApp({
  resolveDatabaseStatus: () => probeDatabase(process.env.DATABASE_URL),
  auth,
  createOrganization: activeDatabase
    ? (input) => createOrganizationForMember(activeDatabase.db, input)
    : undefined,
  listOrganizations: activeDatabase
    ? (userId) => listOrganizationsForMember(activeDatabase.db, userId)
    : undefined,
  getOrganizationForMember: activeDatabase
    ? (userId, organizationId) =>
        getOrganizationForMember(activeDatabase.db, organizationId, userId)
    : undefined,
});

const server = app.listen(port, host, () => {
  console.log(`management api listening on ${host}:${port}`);
});

server.on("error", (error: NodeJS.ErrnoException) => {
  fail(error.message);
});

function shutdown() {
  server.close(() => {
    if (!database) {
      process.exit(0);
      return;
    }
    void database.close().finally(() => {
      process.exit(0);
    });
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
