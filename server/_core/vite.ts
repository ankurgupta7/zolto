import express, { type Express } from "express";
import fs from "node:fs";
import type { Server } from "node:http";
import { nanoid } from "nanoid";
import path from "node:path";
import { injectHeadForRequest } from "../htmlHead";

export async function setupVite(app: Express, server: Server) {
  // Lazy-load vite.config only in dev mode.
  // Using a runtime string prevents esbuild from statically bundling
  // vite.config.ts (and its devDependencies like @vitejs/plugin-react)
  // into the production bundle — those packages are not installed in prod.
  const configPath = "../../vite.config";
  const viteConfig = (await import(/* @vite-ignore */ configPath)).default;
  const { createServer: createViteServer } = await import("vite");

  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  // Mounted without a path: `app.use("*", ...)` would make Express strip the
  // matched mount from req.url, collapsing req.path to "/" for every request
  // and handing injectHeadForRequest the wrong route.
  app.use(async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      // Rewrite <head> per request: marketing SEO for the marketing surface, or
      // the tenant's own favicon + tab identity for a storefront.
      const finalPage = await injectHeadForRequest(req, page);
      res.status(200).set({ "Content-Type": "text/html" }).end(finalPage);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  // In production, dist/index.js lives in /app/dist/ so import.meta.dirname
  // is /app/dist. The Vite-built frontend is at /app/dist/public.
  // In development, the server source is at server/_core/ so we go up two
  // levels to the project root, then into dist/public.
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // `index: false` so a request for "/" is NOT short-circuited by the static
  // handler serving the raw built index.html. The apex has to fall through to
  // the handler below, or the marketing homepage ships with no server-rendered
  // <head> at all (no title, canonical, JSON-LD or <noscript> body).
  app.use(express.static(distPath, { index: false }));

  // fall through to index.html if the file doesn't exist. Mounted without a
  // path — see the note in setupVite: a "*" mount collapses req.path to "/".
  const indexPath = path.resolve(distPath, "index.html");
  app.use(async (req, res) => {
    // Rewrite <head> per request (marketing SEO or per-tenant storefront
    // identity). Any read error falls back to the static shell.
    try {
      const html = await fs.promises.readFile(indexPath, "utf-8");
      res
        .status(200)
        .set({ "Content-Type": "text/html" })
        .end(await injectHeadForRequest(req, html));
    } catch {
      res.sendFile(indexPath);
    }
  });
}
