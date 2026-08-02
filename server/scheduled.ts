/**
 * Scheduled jobs — the marketing copy says "at the end of the day Zolto emails
 * its best guess at what you sold" (SELLING_FLOW, FAQ, FEATURES), but until
 * this module the POS-attribution pass only ran when a merchant pressed the
 * button on /admin/reconciliation. This registers the heartbeat callback that
 * actually runs it every evening, platform-wide.
 *
 * The heartbeat service (server/_core/heartbeat.ts) is an external cron that
 * POSTs back to `/api/scheduled/*` paths. Anyone on the internet can reach
 * those paths too, so the callback carries a bearer token derived from the
 * cookie secret; a request without it is refused.
 */

import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { ENV } from "./_core/env";
import { createHeartbeatJob, listHeartbeatJobs } from "./_core/heartbeat";
import { runPosAttribution } from "./posAttribution";

export const POS_ATTRIBUTION_JOB_NAME = "pos-attribution-daily";
export const POS_ATTRIBUTION_JOB_PATH = "/api/scheduled/pos-attribution";

/**
 * 18:30 UTC daily — 19:30/20:30 in Switzerland depending on DST, i.e. after
 * a market day has wound down but early enough that the merchant still reads
 * email that evening. Six fields because the heartbeat cron includes seconds.
 */
export const POS_ATTRIBUTION_CRON = "0 30 18 * * *";

/**
 * Shared-secret for the callback, derived rather than stored: the heartbeat
 * job's payload embeds it at creation time and the route recomputes it on
 * every request. Empty when no cookie secret is configured (dev), in which
 * case the route refuses to run at all — better silent-off than open.
 */
export function scheduledCallbackToken(): string {
  if (!ENV.cookieSecret) return "";
  return crypto
    .createHmac("sha256", ENV.cookieSecret)
    .update(`scheduled:${POS_ATTRIBUTION_JOB_NAME}`)
    .digest("hex");
}

export function registerScheduledRoutes(app: Express): void {
  app.post(POS_ATTRIBUTION_JOB_PATH, async (req: Request, res: Response) => {
    const expected = scheduledCallbackToken();
    const presented = (req.body as { token?: unknown } | undefined)?.token;
    if (
      !expected ||
      typeof presented !== "string" ||
      presented.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(presented), Buffer.from(expected))
    ) {
      res.sendStatus(403);
      return;
    }

    try {
      // No tenantId: sweep every store's amount-only POS lines. The lookback
      // window overlaps day-to-day on purpose — lines already attributed (or
      // already queued) are excluded by getUnattributedPosLineItems, so a
      // retried or overlapping run cannot double-queue a sale.
      const summary = await runPosAttribution();
      res.json(summary);
    } catch (err) {
      console.error("[Scheduled] POS attribution run failed:", err);
      res.sendStatus(500);
    }
  });
}

/**
 * Idempotently create the daily job at boot. Skips quietly when the heartbeat
 * service or the cookie secret isn't configured (dev, tests, self-hosted
 * without Forge); logs but never throws — a scheduling hiccup must not take
 * the storefront down with it.
 */
export async function ensureDailyPosAttributionJob(): Promise<void> {
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey || !scheduledCallbackToken()) {
    console.log(
      "[Scheduled] Heartbeat service or cookie secret not configured — daily POS attribution not scheduled",
    );
    return;
  }
  try {
    const { jobs } = await listHeartbeatJobs("");
    if (jobs.some((j) => j.name === POS_ATTRIBUTION_JOB_NAME)) return;

    await createHeartbeatJob(
      {
        name: POS_ATTRIBUTION_JOB_NAME,
        cron: POS_ATTRIBUTION_CRON,
        path: POS_ATTRIBUTION_JOB_PATH,
        payload: { token: scheduledCallbackToken() },
        description:
          "End-of-day sweep: attribute amount-only POS sales and email merchants a one-click confirm.",
      },
      "",
    );
    console.log(
      `[Scheduled] Created heartbeat job ${POS_ATTRIBUTION_JOB_NAME} (${POS_ATTRIBUTION_CRON})`,
    );
  } catch (err) {
    console.error("[Scheduled] Could not ensure daily POS attribution:", err);
  }
}
