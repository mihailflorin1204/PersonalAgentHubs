import { eq } from "drizzle-orm";
import type { Database } from "./client.js";
import { memberships, organizations, users } from "./schema.js";
import { requireOrganizationId } from "./scope.js";

export function organizationByIdQuery(db: Database, organizationId: unknown) {
  const scopedOrganizationId = requireOrganizationId(organizationId);
  return db
    .select()
    .from(organizations)
    .where(eq(organizations.id, scopedOrganizationId))
    .limit(1);
}

export async function getOrganization(db: Database, organizationId: unknown) {
  const rows = await organizationByIdQuery(db, organizationId);
  return rows[0] ?? null;
}

export function membershipsForOrganizationQuery(db: Database, organizationId: unknown) {
  const scopedOrganizationId = requireOrganizationId(organizationId);
  return db
    .select()
    .from(memberships)
    .where(eq(memberships.organizationId, scopedOrganizationId));
}

export async function listMembershipsForOrganization(db: Database, organizationId: unknown) {
  return membershipsForOrganizationQuery(db, organizationId);
}

export function usersInOrganizationQuery(db: Database, organizationId: unknown) {
  const scopedOrganizationId = requireOrganizationId(organizationId);
  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: memberships.role,
      membershipId: memberships.id,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organizationId, scopedOrganizationId));
}

export async function listUsersInOrganization(db: Database, organizationId: unknown) {
  return usersInOrganizationQuery(db, organizationId);
}
