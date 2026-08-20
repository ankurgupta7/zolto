/**
 * Count what the AI agents actually do — the reach half of the funnel whose
 * sale half is already recorded as `orders.channel = 'agent'`.
 *
 * Gwinn publishes `/llms.txt`, `/llms-full.txt` and an MCP endpoint on the bet
 * that an agent will discover a store and buy from it (server/llms.ts,
 * server/mcp.ts). Until this module nothing recorded whether one ever did, and
 * nothing on the client could: an agent fetching `/llms.txt` never loads the
 * SPA and never runs JavaScript, so a page-view script — Umami or otherwise —
 * reports zero for precisely this traffic.
 *
 * ## Three rules this middleware obeys, in order of how badly breaking them hurts
 *
 * 1. **It never delays a response.** Everything — the tenant lookup, the write
 *    — happens on `res.on("finish")`, after the bytes are gone. `/mcp` is the
 *    endpoint an agent buys through; measuring it must not slow it.
 * 2. **It never fails a request.** `recordAgentHit` fails open through withDb,
 *    and the handler here is wrapped besides. A lost count is invisible; a
 *    failed checkout is not. Same posture as server/rateLimit.ts, for the same
 *    reason.
 * 3. **It stores no one's identity.** A label like "GPTBot" and a day, nothing
 *    more — no IP, no raw User-Agent, no path beyond the fixed surface list.
 *    This answers "is anything reading my shop?", never "who visited?".
 */

import type { Express, NextFunction, Request, Response } from "express";
import {
  classifyAgent,
  dayKey,
  looksLikeBrowser,
  surfaceForPath,
  UNKNOWN_AGENT,
  type AgentSurface,
} from "@shared/aiAgents";
import { recordAgentHit } from "./db";
import { resolveTenantFromRequest } from "./tenantResolve";

/** The `tenant_id` sentinel for the platform surface (gwinn.ch itself). */
export const PLATFORM_TENANT_ID = 0;

/**
 * Pull the MCP tool name out of a parsed JSON-RPC body.
 *
 * Only `tools/call` names a tool; `initialize`, `tools/list` and `ping` are
 * recorded as plain `/mcp` hits with an empty tool. Defensive throughout —
 * this body is attacker-controlled and arrives before any schema validation
 * the MCP handler does, so every level is checked rather than assumed.
 */
export function mcpToolFromBody(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const method = (body as { method?: unknown }).method;
  if (method !== "tools/call") return "";
  const params = (body as { params?: unknown }).params;
  if (!params || typeof params !== "object") return "";
  const name = (params as { name?: unknown }).name;
  if (typeof name !== "string") return "";
  // Bounded to the column width, and stripped of anything that isn't a plain
  // tool identifier — the value is echoed back into the admin panel, and an
  // unbounded attacker-chosen string has no business getting that far.
  return name.slice(0, 64).replace(/[^\w.-]/g, "");
}

/**
 * Should this request be counted?
 *
 * Excludes browsers, because `/robots.txt` and `/sitemap.xml` get plenty of
 * ordinary human and search-engine traffic and counting a curious shopper who
 * typed the URL would inflate the one number this exists to report honestly.
 * A recognised AI agent is always counted even if it advertises a browser-like
 * User-Agent, which several of the on-demand fetchers do.
 */
export function shouldCount(
  agent: string,
  userAgent: string | undefined,
): boolean {
  if (agent !== UNKNOWN_AGENT) return true;
  return !looksLikeBrowser(userAgent);
}

/**
 * Record one hit. Exported for the tests and for any future caller that has
 * already resolved its own tenant; the middleware is the only production user.
 */
export async function noteAgentHit(params: {
  tenantId: number;
  surface: AgentSurface;
  mcpTool: string;
  userAgent: string | undefined;
  now?: Date;
}): Promise<void> {
  const agent = classifyAgent(params.userAgent);
  if (!shouldCount(agent, params.userAgent)) return;
  await recordAgentHit({
    tenantId: params.tenantId,
    day: dayKey(params.now),
    surface: params.surface,
    mcpTool: params.mcpTool,
    agent,
  });
}

/**
 * Register the counter. Must be mounted AFTER `express.json()` — the MCP tool
 * name is read from the parsed body — and before (or after; it only listens
 * for `finish`) the routes it measures.
 */
export function registerAgentHitTracking(app: Express): void {
  app.use((req: Request, res: Response, next: NextFunction) => {
    const surface = surfaceForPath(req.path);
    // The overwhelmingly common case: not a machine surface, so this costs one
    // string comparison on every other request in the app and nothing else.
    if (!surface) return next();

    const userAgent = req.headers["user-agent"];
    const mcpTool = surface === "mcp" ? mcpToolFromBody(req.body) : "";

    res.on("finish", () => {
      // An error response is a request that didn't happen as far as reach is
      // concerned — a 404 from an unresolvable host, a 429 from the checkout
      // limiter. Counting those would report interest the store never got.
      if (res.statusCode >= 400) return;
      void (async () => {
        try {
          // After the response, so the extra tenant lookup costs the caller
          // nothing. Resolution is an indexed read on a cached pool.
          const tenant = await resolveTenantFromRequest(req);
          await noteAgentHit({
            tenantId: tenant?.id ?? PLATFORM_TENANT_ID,
            surface,
            mcpTool,
            userAgent: typeof userAgent === "string" ? userAgent : undefined,
          });
        } catch (err) {
          // Rule 2. Nothing downstream is listening, so this is the only place
          // a failure can be seen at all.
          console.warn("[AgentHits] failed to record hit:", err);
        }
      })();
    });

    next();
  });
}
