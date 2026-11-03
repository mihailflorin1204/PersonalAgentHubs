import { z } from "zod";

const organizationIdSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export class OrganizationScopeError extends Error {
  constructor(message = "A valid organization id is required") {
    super(message);
    this.name = "OrganizationScopeError";
  }
}

export class UserScopeError extends Error {
  constructor() {
    super("A valid user id is required");
    this.name = "UserScopeError";
  }
}

export class OrganizationInputError extends Error {
  constructor() {
    super("Organization name is invalid");
    this.name = "OrganizationInputError";
  }
}

/**
 * Fail closed. Tenant-owned reads must name one organization, and the value
 * must be an id. The thrown error does not echo the rejected input.
 */
export function requireOrganizationId(organizationId: unknown): string {
  const parsed = organizationIdSchema.safeParse(organizationId);
  if (!parsed.success) {
    throw new OrganizationScopeError();
  }
  return parsed.data;
}

/**
 * Fail closed. A session user id must be the uuid stored on the user row.
 * The thrown error does not echo the rejected input.
 */
export function requireUserId(userId: unknown): string {
  const parsed = organizationIdSchema.safeParse(userId);
  if (!parsed.success) {
    throw new UserScopeError();
  }
  return parsed.data;
}

const organizationNameSchema = z.string().trim().min(1).max(200);

export function requireOrganizationName(name: unknown): string {
  const parsed = organizationNameSchema.safeParse(name);
  if (!parsed.success) {
    throw new OrganizationInputError();
  }
  return parsed.data;
}
