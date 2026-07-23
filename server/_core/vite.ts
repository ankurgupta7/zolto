import express, { type Express } from "express";
import fs from "node:fs";
import type { Server } from "node:http";
import { nanoid } from "nanoid";
import path from "node:path";
import { isMarketingHost } from "@shared/marketing";
import { injectMarketingHead } from "../marketingSeo";
import { resolveBaseUrl } from "../seo";

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
  app.use("*", async (req, res, next) => {
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
      // Inject server-rendered SEO (title/meta/JSON-LD/noscript) for marketing
      // routes so non-JS crawlers and AI bots see real content. No-op elsewhere.
      const finalPage = isMarketingHost(req.headers.host || "", req.url)
        ? injectMarketingHead(page, req.path, resolveBaseUrl(req))
        : page;
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

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  const indexPath = path.resolve(distPath, "index.html");
  app.use("*", async (req, res) => {
    // Marketing routes get server-rendered SEO injected; everything else (and
    // any read error) falls back to the static shell.
    if (isMarketingHost(req.headers.host || "", req.url)) {
      try {
        const html = await fs.promises.readFile(indexPath, "utf-8");
        res
          .status(200)
          .set({ "Content-Type": "text/html" })
          .end(injectMarketingHead(html, req.path, resolveBaseUrl(req)));
        return;
      } catch {
        /* fall through to sendFile */
      }
    }
    res.sendFile(indexPath);
  });
}
