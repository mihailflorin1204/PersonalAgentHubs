import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import express from "express";
import type { DatabaseStatus } from "@agenthub/database";
import { OrganizationInputError, OrganizationScopeError, UserScopeError } from "@agenthub/database";
import { z } from "zod";

export type HealthBody = {
  status: "ok";
  database: DatabaseStatus;
};

export type OrganizationRecord = {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

export type SessionIdentity = {
  userId: string;
  sessionId: string;
};

export type AuthAdapter = {
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  readSession: (headers: IncomingHttpHeaders) => Promise<SessionIdentity | null>;
};

export type CreateAppOptions = {
  resolveDatabaseStatus: () => DatabaseStatus | Promise<DatabaseStatus>;
  auth?: AuthAdapter;
  createOrganization?: (input: { userId: string; name: string }) => Promise<OrganizationRecord>;
  listOrganizations?: (userId: string) => Promise<OrganizationRecord[]>;
  getOrganizationForMember?: (
    userId: string,
    organizationId: string,
  ) => Promise<OrganizationRecord | null>;
};

const createOrganizationBody = z.object({
  name: z.string().trim().min(1).max(200),
});

function serializeOrganization(organization: OrganizationRecord) {
  return {
    id: organization.id,
    name: organization.name,
    createdAt: organization.createdAt.toISOString(),
    updatedAt: organization.updatedAt.toISOString(),
  };
}

function isAuthPath(path: string): boolean {
  return path === "/api/auth" || path.startsWith("/api/auth/");
}

export function createApp(options: CreateAppOptions): express.Express {
  const app = express();
  app.disable("x-powered-by");

  app.use((req, res, next) => {
    if (!isAuthPath(req.path)) {
      next();
      return;
    }
    const handler = options.auth?.handler;
    if (!handler) {
      res.status(401).json({ status: "unauthorized" });
      return;
    }
    Promise.resolve(handler(req, res)).catch((error: unknown) => {
      next(error);
    });
  });

  app.use(express.json({ limit: "20kb" }));

  app.get("/health", (_req, res, next) => {
    Promise.resolve()
      .then(async () => {
        const database = await options.resolveDatabaseStatus();
        const body: HealthBody = { status: "ok", database };
        res.status(200).json(body);
      })
      .catch((error: unknown) => {
        next(error);
      });
  });

  app.post("/organizations", (req, res, next) => {
    Promise.resolve()
      .then(async () => {
        const userId = await readUserId(options, req.headers);
        if (!userId || !options.createOrganization) {
          res.status(401).json({ status: "unauthorized" });
          return;
        }
        const parsed = createOrganizationBody.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ status: "invalid_request" });
          return;
        }
        const organization = await options.createOrganization({
          userId,
          name: parsed.data.name,
        });
        res.status(201).json(serializeOrganization(organization));
      })
      .catch((error: unknown) => {
        if (error instanceof OrganizationInputError) {
          res.status(400).json({ status: "invalid_request" });
          return;
        }
        if (error instanceof UserScopeError || error instanceof OrganizationScopeError) {
          res.status(401).json({ status: "unauthorized" });
          return;
        }
        next(error);
      });
  });

  app.get("/organizations", (req, res, next) => {
    Promise.resolve()
      .then(async () => {
        const userId = await readUserId(options, req.headers);
        if (!userId || !options.listOrganizations) {
          res.status(401).json({ status: "unauthorized" });
          return;
        }
        const organizations = await options.listOrganizations(userId);
        res.status(200).json({
          organizations: organizations.map(serializeOrganization),
        });
      })
      .catch((error: unknown) => {
        if (error instanceof UserScopeError || error instanceof OrganizationScopeError) {
          res.status(401).json({ status: "unauthorized" });
          return;
        }
        next(error);
      });
  });

  app.get("/organizations/:organizationId", (req, res, next) => {
    Promise.resolve()
      .then(async () => {
        const userId = await readUserId(options, req.headers);
        if (!userId || !options.getOrganizationForMember) {
          res.status(401).json({ status: "unauthorized" });
          return;
        }
        const organizationId = req.params.organizationId;
        if (typeof organizationId !== "string") {
          res.status(404).json({ status: "not_found" });
          return;
        }
        const organization = await options.getOrganizationForMember(userId, organizationId);
        if (!organization) {
          res.status(404).json({ status: "not_found" });
          return;
        }
        res.status(200).json(serializeOrganization(organization));
      })
      .catch((error: unknown) => {
        if (error instanceof UserScopeError) {
          res.status(401).json({ status: "unauthorized" });
          return;
        }
        if (error instanceof OrganizationScopeError) {
          res.status(404).json({ status: "not_found" });
          return;
        }
        next(error);
      });
  });

  app.use((_req, res) => {
    res.status(404).json({ status: "not_found" });
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("request failed");
    void error;
    if (res.headersSent) {
      return;
    }
    if (error instanceof SyntaxError) {
      res.status(400).json({ status: "invalid_request" });
      return;
    }
    res.status(500).json({ status: "error" });
  });

  return app;
}

async function readUserId(
  options: CreateAppOptions,
  headers: IncomingHttpHeaders,
): Promise<string | null> {
  if (!options.auth) {
    return null;
  }
  try {
    const session = await options.auth.readSession(headers);
    return session?.userId ?? null;
  } catch {
    return null;
  }
}
