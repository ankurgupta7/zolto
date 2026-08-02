import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerAppleOAuthRoutes } from "./appleAuth";
import { registerMagicLinkRoutes } from "./magicLink";
import { registerUploadsProxy } from "./uploadsProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { registerStripeWebhook } from "../stripe";
import {
  logConnectConfigStatus,
  registerStripeConnectRoutes,
} from "../stripeConnect";
import { registerPosWebhook, registerPosRoutes } from "../pos";
import { registerChannelIntakeRoutes } from "../channels";
import { registerSlackOAuthRoutes } from "../slackOAuth";
import { registerScheduledRoutes } from "../scheduled";
import { registerReconciliationRoutes } from "../reconciliationRoutes";
import { registerPosAttributionRoutes } from "../posAttributionRoutes";
import { registerSeoRoutes } from "../seo";
import { registerLlmsRoutes } from "../llms";
import { registerMcpRoutes } from "../mcp";
import { registerDomainAsk } from "../domainAsk";
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

  // These webhook handlers need the raw request body for signature
  // verification, so they must be registered BEFORE the global JSON body
  // parser below.
  registerStripeWebhook(app);
  registerPosWebhook(app);
  // WhatsApp + Slack product intake (Discord's gateway is started by the
  // bootstrap in index.ts — it's a websocket, not a route).
  registerChannelIntakeRoutes(app);

  // Larger body limit for base64 image uploads.
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerUploadsProxy(app);
  registerOAuthRoutes(app);
  registerAppleOAuthRoutes(app);
  registerMagicLinkRoutes(app);
  registerStripeConnectRoutes(app);
  // Surface a Connect misconfiguration at boot rather than letting a merchant
  // discover it by tapping "Connect Stripe".
  logConnectConfigStatus();

  // POS Terminal API
  registerPosRoutes(app);

  // One-click confirmation links from the Stripe reconciliation review email
  registerReconciliationRoutes(app);
  registerPosAttributionRoutes(app);

  // Heartbeat-cron callbacks (e.g. the nightly POS-attribution sweep).
  registerScheduledRoutes(app);

  // Add-to-Slack OAuth callback (writes the workspace bot token to the vault).
  registerSlackOAuthRoutes(app);

  // SEO discovery: /sitemap.xml + /robots.txt (before the SPA catch-all).
  registerSeoRoutes(app);

  // AI-agent discovery: /llms.txt (tenant-aware) + the MCP product endpoint.
  registerLlmsRoutes(app);
  registerMcpRoutes(app);

  // Caddy on-demand-TLS "ask" for tenant custom domains (Maker plan+).
  registerDomainAsk(app);

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
