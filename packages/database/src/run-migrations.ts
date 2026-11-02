import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { openDatabase } from "./client.js";

export async function runMigrations(connectionString: string | undefined): Promise<void> {
  const database = openDatabase(connectionString);
  try {
    const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));
    await migrate(database.db, { migrationsFolder });
  } finally {
    await database.close();
  }
}
