import express from "express";

export type HealthBody = {
  status: "ok";
};

/**
 * The MCP endpoint does not exist yet. Every path other than GET /health is
 * a JSON 404 so nothing reaches a tool before routing and policy exist.
 */
export function createApp(): express.Express {
  const app = express();
  app.disable("x-powered-by");

  app.get("/health", (_req, res) => {
    const body: HealthBody = { status: "ok" };
    res.status(200).json(body);
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
