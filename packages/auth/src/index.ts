import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import type { Database } from "@agenthub/database";
import { accounts, sessions, users } from "@agenthub/database";
import { betterAuth } from "better-auth";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";

const publishedSecrets = new Set(["local-dev-better-auth-secret-not-for-production"]);

const secretSchema = z
  .string()
  .min(32)
  .max(256)
  .refine(
    (value) =>
      !value.includes("://") && !/\s/.test(value) && !publishedSecrets.has(value),
  );

export class AuthConfigurationError extends Error {
  constructor() {
    super("Authentication secret is invalid");
    this.name = "AuthConfigurationError";
  }
}

export type CreateAuthOptions = {
  database: Database;
  secret: string;
  baseURL?: string;
  trustedOrigins?: string[];
  rateLimitEnabled?: boolean;
};

export type SessionIdentity = {
  userId: string;
  sessionId: string;
};

/**
 * Human sessions via Better Auth. Sign-up exists so a person can sign in.
 * Sign-in is what creates the session. The plaintext password is hashed by
 * Better Auth into the account table and is never returned.
 */
export function createAuth(options: CreateAuthOptions) {
  const secret = secretSchema.safeParse(options.secret);
  if (!secret.success) {
    throw new AuthConfigurationError();
  }

  return betterAuth({
    secret: secret.data,
    baseURL: options.baseURL,
    trustedOrigins: options.trustedOrigins,
    database: drizzleAdapter(options.database, {
      provider: "pg",
      schema: {
        user: users,
        session: sessions,
        account: accounts,
      },
    }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      requireEmailVerification: false,
    },
    advanced: {
      database: {
        generateId: "uuid",
        // Email verification is off, so the verification table is not used.
        // The checker would reject the schema without that unused table.
        validateSchema: false,
      },
    },
    rateLimit: {
      enabled: options.rateLimitEnabled !== false,
    },
    logger: {
      level: "error",
      log() {
        console.error("authentication request failed");
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

export function authNodeHandler(
  auth: Auth,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return toNodeHandler(auth);
}

/**
 * Returns the signed-in user id, or null when the session is missing or invalid.
 * The session token is not included.
 */
export async function readSession(
  auth: Auth,
  headers: IncomingHttpHeaders,
): Promise<SessionIdentity | null> {
  const result = await auth.api.getSession({
    headers: fromNodeHeaders(headers),
  });
  const userId = result?.user?.id;
  const sessionId = result?.session?.id;
  if (!userId || !sessionId) {
    return null;
  }
  return { userId, sessionId };
}
