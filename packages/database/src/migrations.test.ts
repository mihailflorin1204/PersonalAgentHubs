import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const drizzleDir = fileURLToPath(new URL("../drizzle", import.meta.url));

it("ships SQL migrations for organizations, users, and memberships", async () => {
  const entries = await readdir(drizzleDir);
  const sqlFiles = entries.filter((name) => name.endsWith(".sql"));
  expect(sqlFiles.length).toBeGreaterThan(0);

  const sql = (
    await Promise.all(sqlFiles.map((name) => readFile(path.join(drizzleDir, name), "utf8")))
  )
    .join("\n")
    .toLowerCase();

  expect(sql).toContain('create table "organizations"');
  expect(sql).toContain('create table "users"');
  expect(sql).toContain('create table "memberships"');
  expect(sql).toContain('create table "sessions"');
  expect(sql).toContain('create table "accounts"');
  expect(sql).toContain("email_verified");
  expect(sql).toContain("organization_id");
  expect(sql).toContain("user_id");
  expect(sql).toContain("organization_role");
  expect(sql).toContain("references");
  expect(sql).not.toContain("row level security");
  expect(sql).not.toContain("api_key");

  const journal = JSON.parse(
    await readFile(path.join(drizzleDir, "meta", "_journal.json"), "utf8"),
  ) as { dialect: string; entries: unknown[] };
  expect(journal.dialect).toBe("postgresql");
  expect(journal.entries.length).toBeGreaterThan(0);
});
