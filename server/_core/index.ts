import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import net from "node:net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerUploadsProxy } from "./uploadsProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerStripeWebhook } from "../stripe";
import { registerStripeConnectRoutes } from "../stripeConnect";
import { registerPosWebhook, registerPosRoutes } from "../pos";
import { registerReconciliationRoutes } from "../reconciliationRoutes";
import { registerSeoRoutes } from "../seo";
import { registerLlmsRoutes } from "../llms";
import { registerMcpRoutes } from "../mcp";
import { getDb } from "../db";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  // Initialize the DB connection at boot. Tenant resolution (createContext) reads
  // the `db` query proxy directly, which throws until getDb() has run once — and
  // since storefront reads now require a resolved tenant, a cold DB would fail
  // every request. Warming it here makes the proxy usable from the first request.
  await getDb();

  const app = express();
  const server = createServer(app);
  // Both webhook handlers need the raw request body for signature verification,
  // so they must be registered BEFORE the global JSON body parser below.
  registerStripeWebhook(app);
  registerPosWebhook(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerUploadsProxy(app);
  registerOAuthRoutes(app);
  registerStripeConnectRoutes(app);

  // POS Terminal API
  registerPosRoutes(app);

  // One-click confirmation links from the Stripe reconciliation review email
  registerReconciliationRoutes(app);

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
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000", 10);
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
