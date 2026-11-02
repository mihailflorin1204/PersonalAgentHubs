import express from "express";
import type { DatabaseStatus } from "@agenthub/database";

export type HealthBody = {
  status: "ok";
  database: DatabaseStatus;
};

export type CreateAppOptions = {
  resolveDatabaseStatus: () => DatabaseStatus | Promise<DatabaseStatus>;
};

export function createApp(options: CreateAppOptions): express.Express {
  const app = express();
  app.disable("x-powered-by");

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

  app.use((_req, res) => {
    res.status(404).json({ status: "not_found" });
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("request failed");
    void error;
    if (res.headersSent) {
      return;
    }
    res.status(500).json({ status: "error" });
  });

  return app;
}
