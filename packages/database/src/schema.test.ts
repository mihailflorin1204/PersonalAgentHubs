import { getTableColumns, getTableName } from "drizzle-orm";
import { expect, it } from "vitest";
import { memberships, organizationRole, organizations, users } from "./schema.js";

it("names the organization, user, and membership tables", () => {
  expect(getTableName(organizations)).toBe("organizations");
  expect(getTableName(users)).toBe("users");
  expect(getTableName(memberships)).toBe("memberships");
});

it("keeps users global and organizations as the tenant root", () => {
  expect(getTableColumns(users)).not.toHaveProperty("organizationId");
  expect(getTableColumns(organizations).id?.name).toBe("id");
});

it("binds each membership to one organization, one user, and a role", () => {
  const columns = getTableColumns(memberships);
  expect(columns.organizationId?.name).toBe("organization_id");
  expect(columns.userId?.name).toBe("user_id");
  expect(columns.role?.name).toBe("role");
  expect(organizationRole.enumValues).toEqual(["owner", "admin", "member"]);
});
