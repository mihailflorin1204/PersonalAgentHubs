import { getTableColumns, getTableName } from "drizzle-orm";
import { expect, it } from "vitest";
import { accounts, memberships, organizationRole, organizations, sessions, users } from "./schema.js";

it("names the organization, user, and membership tables", () => {
  expect(getTableName(organizations)).toBe("organizations");
  expect(getTableName(users)).toBe("users");
  expect(getTableName(memberships)).toBe("memberships");
});

it("keeps users global and organizations as the tenant root", () => {
  const columns = getTableColumns(users);
  expect(columns).not.toHaveProperty("organizationId");
  expect(columns.emailVerified?.name).toBe("email_verified");
  expect(columns.image?.name).toBe("image");
  expect(getTableColumns(organizations).id?.name).toBe("id");
});

it("stores Better Auth sessions and accounts against the user, not an organization", () => {
  expect(getTableName(sessions)).toBe("sessions");
  expect(getTableName(accounts)).toBe("accounts");
  const sessionColumns = getTableColumns(sessions);
  const accountColumns = getTableColumns(accounts);
  expect(sessionColumns.userId?.name).toBe("user_id");
  expect(sessionColumns.token?.name).toBe("token");
  expect(sessionColumns).not.toHaveProperty("organizationId");
  expect(accountColumns.userId?.name).toBe("user_id");
  expect(accountColumns.password?.name).toBe("password");
  expect(accountColumns).not.toHaveProperty("organizationId");
});

it("binds each membership to one organization, one user, and a role", () => {
  const columns = getTableColumns(memberships);
  expect(columns.organizationId?.name).toBe("organization_id");
  expect(columns.userId?.name).toBe("user_id");
  expect(columns.role?.name).toBe("role");
  expect(organizationRole.enumValues).toEqual(["owner", "admin", "member"]);
});
