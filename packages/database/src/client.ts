import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { readDatabaseUrl, requireDatabaseUrl } from "./database-url.js";
import * as schema from "./schema.js";

export type DatabaseStatus = "unconfigured" | "unreachable" | "connected";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

export type OpenDatabase = {
  db: Database;
  close: () => Promise<void>;
};

/**
 * Opens a PostgreSQL connection. A missing URL throws before any socket is opened.
 */
export function openDatabase(connectionString: string | undefined): OpenDatabase {
  const url = requireDatabaseUrl(connectionString);
  const client = postgres(url, {
    max: 10,
    connection: {
      application_name: "agenthub-management-api",
    },
  });
  const db = drizzle(client, { schema });
  return {
    db,
    async close() {
      await client.end();
    },
  };
}

/**
 * Reports whether PostgreSQL accepted a query. A missing URL is unconfigured.
 * A failed attempt is unreachable and is never reported as connected.
 */
export async function probeDatabase(
  connectionString: string | undefined,
): Promise<DatabaseStatus> {
  const url = readDatabaseUrl(connectionString);
  if (url === undefined) {
    return "unconfigured";
  }

  const client = postgres(url, {
    max: 1,
    connect_timeout: 3,
    idle_timeout: 1,
    connection: {
      application_name: "agenthub-management-api",
    },
  });

  try {
    await client`select 1`;
    return "connected";
  } catch {
    return "unreachable";
  } finally {
    try {
      await client.end({ timeout: 1 });
    } catch {
      // Closing a failed socket must not change the probe result.
    }
  }
}
