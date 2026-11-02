import { expect, it } from "vitest";
import { OrganizationScopeError, requireOrganizationId } from "./scope.js";

const organizationId = "11111111-1111-4111-8111-111111111111";

it("accepts an organization id", () => {
  expect(requireOrganizationId(organizationId)).toBe(organizationId);
});

it("fails closed when the organization id is missing or invalid", () => {
  const rejected = [undefined, null, "", "   ", "not-a-uuid", "postgres://user:secret@localhost/db"];
  for (const value of rejected) {
    expect(() => requireOrganizationId(value)).toThrow(OrganizationScopeError);
    try {
      requireOrganizationId(value);
    } catch (error) {
      expect(error).toBeInstanceOf(OrganizationScopeError);
      expect((error as Error).message).toBe("A valid organization id is required");
      expect((error as Error).message).not.toContain("secret");
    }
  }
});
