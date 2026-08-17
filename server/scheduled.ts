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
import { isSheetsConfigured } from "./googleSheets";
import { runSheetMirrorSweep } from "./sheetMirror";

export const POS_ATTRIBUTION_JOB_NAME = "pos-attribution-daily";
export const POS_ATTRIBUTION_JOB_PATH = "/api/scheduled/pos-attribution";

/**
 * 18:30 UTC daily — 19:30/20:30 in Switzerland depending on DST, i.e. after
 * a market day has wound down but early enough that the merchant still reads
 * email that evening. Six fields because the heartbeat cron includes seconds.
 */
export const POS_ATTRIBUTION_CRON = "0 30 18 * * *";

export const SHEET_MIRROR_JOB_NAME = "sheet-mirror-sync";
export const SHEET_MIRROR_JOB_PATH = "/api/scheduled/sheet-mirror";

/**
 * Hourly, on the hour. Not more often: the Sheets API's read/write quota is per
 * PROJECT — shared by every store on the platform — so the sweep's cost grows
 * with the number of connected stores while the budget does not. A merchant who
 * wants their sheet current right now has the Refresh button
 * (`sheets.syncNow`), which is the honest place for impatience.
 */
export const SHEET_MIRROR_CRON = "0 0 * * * *";

/**
 * Shared-secret for a callback, derived rather than stored: the heartbeat job's
 * payload embeds it at creation time and the route recomputes it on every
 * request. Empty when no cookie secret is configured (dev), in which case the
 * route refuses to run at all — better silent-off than open.
 *
 * Per-job by construction, so a token that leaks from one job's payload cannot
 * be replayed against another job's endpoint.
 */
export function scheduledCallbackToken(
  jobName: string = POS_ATTRIBUTION_JOB_NAME,
): string {
  if (!ENV.cookieSecret) return "";
  return crypto
    .createHmac("sha256", ENV.cookieSecret)
    .update(`scheduled:${jobName}`)
    .digest("hex");
}

/**
 * Constant-time check of a callback's bearer token against the one derived for
 * `jobName`. Length is compared first because timingSafeEqual throws on a
 * length mismatch rather than returning false.
 */
function tokenAccepted(jobName: string, presented: unknown): boolean {
  const expected = scheduledCallbackToken(jobName);
  if (
    !expected ||
    typeof presented !== "string" ||
    presented.length !== expected.length
  ) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(presented), Buffer.from(expected));
}

export function registerScheduledRoutes(app: Express): void {
  app.post(POS_ATTRIBUTION_JOB_PATH, async (req: Request, res: Response) => {
    const presented = (req.body as { token?: unknown } | undefined)?.token;
    if (!tokenAccepted(POS_ATTRIBUTION_JOB_NAME, presented)) {
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

  app.post(SHEET_MIRROR_JOB_PATH, async (req: Request, res: Response) => {
    const presented = (req.body as { token?: unknown } | undefined)?.token;
    if (!tokenAccepted(SHEET_MIRROR_JOB_NAME, presented)) {
      res.sendStatus(403);
      return;
    }

    try {
      // Every connected store, sequentially. runSheetMirrorSweep swallows a
      // single store's failure and reports the count, so one merchant who
      // deleted their spreadsheet cannot stop everyone else's refresh.
      const summary = await runSheetMirrorSweep();
      res.json(summary);
    } catch (err) {
      console.error("[Scheduled] Sheet mirror sweep failed:", err);
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

/**
 * Idempotently create the hourly spreadsheet-mirror sweep at boot.
 *
 * Gated on the Google credentials as well as the heartbeat service: with no
 * service account configured (every self-hosted install by default) no store can
 * have a mirror, so scheduling a job that would sweep nothing every hour forever
 * is pure noise. Same never-throw contract as its sibling above — a scheduling
 * hiccup must not take the storefront down.
 */
export async function ensureSheetMirrorSyncJob(): Promise<void> {
  if (
    !ENV.forgeApiUrl ||
    !ENV.forgeApiKey ||
    !scheduledCallbackToken(SHEET_MIRROR_JOB_NAME)
  ) {
    console.log(
      "[Scheduled] Heartbeat service or cookie secret not configured — sheet mirror sync not scheduled",
    );
    return;
  }
  if (!isSheetsConfigured()) {
    console.log(
      "[Scheduled] Google Sheets not configured — sheet mirror sync not scheduled",
    );
    return;
  }
  try {
    const { jobs } = await listHeartbeatJobs("");
    if (jobs.some((j) => j.name === SHEET_MIRROR_JOB_NAME)) return;

    await createHeartbeatJob(
      {
        name: SHEET_MIRROR_JOB_NAME,
        cron: SHEET_MIRROR_CRON,
        path: SHEET_MIRROR_JOB_PATH,
        payload: { token: scheduledCallbackToken(SHEET_MIRROR_JOB_NAME) },
        description:
          "Hourly: republish every connected store's sales and inventory into its Google Sheet mirror.",
      },
      "",
    );
    console.log(
      `[Scheduled] Created heartbeat job ${SHEET_MIRROR_JOB_NAME} (${SHEET_MIRROR_CRON})`,
    );
  } catch (err) {
    console.error("[Scheduled] Could not ensure sheet mirror sync:", err);
  }
}
