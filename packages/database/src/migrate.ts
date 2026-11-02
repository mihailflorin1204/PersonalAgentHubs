import { redactConnectionString } from "./database-url.js";
import { runMigrations } from "./run-migrations.js";

function migrationErrorText(error: unknown): string {
  const lines: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current instanceof Error && !seen.has(current) && lines.length < 4) {
    seen.add(current);
    const code =
      "code" in current && typeof current.code === "string" ? `${current.code}: ` : "";
    lines.push(`${code}${current.message}`);
    current = current.cause;
  }

  return redactConnectionString(lines.join("\n") || "migrations failed");
}

try {
  await runMigrations(process.env.DATABASE_URL);
  console.log("migrations applied");
} catch (error) {
  console.error(migrationErrorText(error));
  process.exitCode = 1;
}
