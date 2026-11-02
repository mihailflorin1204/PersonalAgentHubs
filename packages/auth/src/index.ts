/**
 * Human-session package boundary.
 *
 * Better Auth is the session library. Sign-in, session issuance, and
 * organization creation belong to a later story. This module does not
 * create sessions or credentials.
 */
export const sessionBoundary = {
  library: "better-auth",
  sessionsImplemented: false,
  credentialsImplemented: false,
} as const;
