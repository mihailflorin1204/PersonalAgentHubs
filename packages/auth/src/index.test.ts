import { expect, it } from "vitest";
import { AuthConfigurationError, createAuth } from "./index.js";

it("rejects an authentication secret that is missing or too short", () => {
  const database = {} as never;
  const rejected = [
    "",
    "short",
    "postgres://user:secret@localhost/db",
    "local-dev-better-auth-secret-not-for-production",
  ];
  for (const secret of rejected) {
    expect(() => createAuth({ database, secret })).toThrow(AuthConfigurationError);
    try {
      createAuth({ database, secret });
    } catch (error) {
      expect(error).toBeInstanceOf(AuthConfigurationError);
      expect((error as Error).message).toBe("Authentication secret is invalid");
      if (secret !== "") {
        expect((error as Error).message).not.toContain(secret);
      }
    }
  }
});
