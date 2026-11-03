import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { expect, it } from "vitest";
import type { Database } from "./client.js";
import {
  membershipsForOrganizationQuery,
  organizationByIdQuery,
  organizationForMemberQuery,
  organizationsForMemberQuery,
  usersInOrganizationQuery,
} from "./queries.js";
import * as schema from "./schema.js";
import { OrganizationScopeError, UserScopeError } from "./scope.js";

const organizationId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

async function withDatabase(run: (db: Database) => void) {
  const client = postgres("postgresql://127.0.0.1:9/agenthub", {
    max: 1,
    connect_timeout: 1,
  });
  try {
    run(drizzle(client, { schema }));
  } finally {
    await client.end({ timeout: 1 });
  }
}

it("fails closed before touching the database when the organization id is missing", () => {
  const db = undefined as unknown as Database;
  expect(() => organizationByIdQuery(db, "")).toThrow(OrganizationScopeError);
  expect(() => membershipsForOrganizationQuery(db, undefined)).toThrow(OrganizationScopeError);
  expect(() => usersInOrganizationQuery(db, "not-a-uuid")).toThrow(OrganizationScopeError);
  expect(() => organizationsForMemberQuery(db, "not-a-uuid")).toThrow(UserScopeError);
  expect(() => organizationForMemberQuery(db, organizationId, undefined)).toThrow(UserScopeError);
  expect(() => organizationForMemberQuery(db, "not-a-uuid", userId)).toThrow(OrganizationScopeError);
});

it("scopes tenant reads to the organization id parameter", async () => {
  await withDatabase((db) => {
    const organization = organizationByIdQuery(db, organizationId).toSQL();
    expect(organization.params[0]).toBe(organizationId);
    expect(organization.sql.toLowerCase()).toContain('"organizations"');
    expect(organization.sql).not.toContain(organizationId);

    for (const build of [membershipsForOrganizationQuery, usersInOrganizationQuery]) {
      const compiled = build(db, organizationId).toSQL();
      expect(compiled.params).toEqual([organizationId]);
      expect(compiled.sql.toLowerCase()).toContain("organization_id");
      expect(compiled.sql).not.toContain(organizationId);
    }

    const visible = organizationsForMemberQuery(db, userId).toSQL();
    expect(visible.params).toEqual([userId]);
    expect(visible.sql.toLowerCase()).toContain("user_id");
    expect(visible.sql.toLowerCase()).toContain('"organizations"');
    expect(visible.sql).not.toContain(userId);

    const one = organizationForMemberQuery(db, organizationId, userId).toSQL();
    expect(one.params).toEqual([organizationId, userId, 1]);
    expect(one.sql.toLowerCase()).toContain("organization_id");
    expect(one.sql.toLowerCase()).toContain("user_id");
    expect(one.sql).not.toContain(organizationId);
    expect(one.sql).not.toContain(userId);
  });
});
