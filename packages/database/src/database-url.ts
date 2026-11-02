/**
 * Reads a PostgreSQL URL from the environment. Blank values are treated as unset.
 * The returned string is never written to logs by this helper.
 */
export function readDatabaseUrl(connectionString: string | undefined): string | undefined {
  const url = connectionString?.trim() ?? "";
  return url === "" ? undefined : url;
}

export function requireDatabaseUrl(connectionString: string | undefined): string {
  const url = readDatabaseUrl(connectionString);
  if (url === undefined) {
    throw new Error("DATABASE_URL is required to run migrations");
  }
  return url;
}

export function redactConnectionString(message: string): string {
  return message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]");
}
