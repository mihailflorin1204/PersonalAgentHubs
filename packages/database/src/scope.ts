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
