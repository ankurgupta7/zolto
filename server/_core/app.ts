import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerUploadsProxy } from "./uploadsProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { registerStripeWebhook } from "../stripe";
import { registerStripeConnectRoutes } from "../stripeConnect";
import { registerPosWebhook, registerPosRoutes } from "../pos";
import { registerReconciliationRoutes } from "../reconciliationRoutes";
import { registerPosAttributionRoutes } from "../posAttributionRoutes";
import { registerSeoRoutes } from "../seo";
import { registerLlmsRoutes } from "../llms";
import { registerMcpRoutes } from "../mcp";
import { getDb } from "../db";

/**
 * Assemble the Express app with every API route and middleware wired in the
 * correct order, WITHOUT binding a port or attaching the SPA/static handler.
 *
 * Split out from startServer() (see index.ts) so the whole HTTP surface can be
 * booted and smoke-tested in-process (see app.smoke.test.ts), and so the server
 * bootstrap stays a thin port-binding shell.
 */
export async function createApp(): Promise<express.Express> {
  // Warm the DB connection so the tenant-resolution proxy is usable from the
  // first request. Safe when DATABASE_URL is unset — getDb() returns null and
  // reads degrade to their fallbacks.
  await getDb();

  const app = express();

  // Both webhook handlers need the raw request body for signature verification,
  // so they must be registered BEFORE the global JSON body parser below.
  registerStripeWebhook(app);
  registerPosWebhook(app);

  // Larger body limit for base64 image uploads.
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerUploadsProxy(app);
  registerOAuthRoutes(app);
  registerStripeConnectRoutes(app);

  // POS Terminal API
  registerPosRoutes(app);

  // One-click confirmation links from the Stripe reconciliation review email
  registerReconciliationRoutes(app);
  registerPosAttributionRoutes(app);

  // SEO discovery: /sitemap.xml + /robots.txt (before the SPA catch-all).
  registerSeoRoutes(app);

  // AI-agent discovery: /llms.txt (tenant-aware) + the MCP product endpoint.
  registerLlmsRoutes(app);
  registerMcpRoutes(app);

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  return app;
}
