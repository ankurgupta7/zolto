import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const { ENV } = vi.hoisted(() => ({
  ENV: {
    cookieSecret: "test-cookie-secret",
    forgeApiUrl: "",
    forgeApiKey: "",
  },
}));

const mocks = vi.hoisted(() => ({
  runPosAttribution: vi.fn(),
  createHeartbeatJob: vi.fn(),
  listHeartbeatJobs: vi.fn(),
  runSheetMirrorSweep: vi.fn(),
  isSheetsConfigured: vi.fn(() => true),
}));

vi.mock("./_core/env", () => ({ ENV }));
vi.mock("./posAttribution", () => ({
  runPosAttribution: mocks.runPosAttribution,
}));
vi.mock("./_core/heartbeat", () => ({
  createHeartbeatJob: mocks.createHeartbeatJob,
  listHeartbeatJobs: mocks.listHeartbeatJobs,
}));
vi.mock("./sheetMirror", () => ({
  runSheetMirrorSweep: mocks.runSheetMirrorSweep,
}));
vi.mock("./googleSheets", () => ({
  isSheetsConfigured: mocks.isSheetsConfigured,
}));

import {
  registerScheduledRoutes,
  ensureDailyPosAttributionJob,
  scheduledCallbackToken,
  POS_ATTRIBUTION_JOB_NAME,
  POS_ATTRIBUTION_JOB_PATH,
  POS_ATTRIBUTION_CRON,
  ensureSheetMirrorSyncJob,
  SHEET_MIRROR_JOB_NAME,
  SHEET_MIRROR_JOB_PATH,
  SHEET_MIRROR_CRON,
} from "./scheduled";

function buildApp() {
  const app = express();
  app.use(express.json());
  registerScheduledRoutes(app);
  return app;
}

describe("POST /api/scheduled/pos-attribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ENV.cookieSecret = "test-cookie-secret";
    ENV.forgeApiUrl = "";
    ENV.forgeApiKey = "";
  });

  it("refuses a callback without the token", async () => {
    const res = await request(buildApp())
      .post(POS_ATTRIBUTION_JOB_PATH)
      .send({});
    expect(res.status).toBe(403);
    expect(mocks.runPosAttribution).not.toHaveBeenCalled();
  });

  it("refuses a callback with the wrong token", async () => {
    const res = await request(buildApp())
      .post(POS_ATTRIBUTION_JOB_PATH)
      .send({ token: "not-the-token" });
    expect(res.status).toBe(403);
    expect(mocks.runPosAttribution).not.toHaveBeenCalled();
  });

  it("runs the platform-wide sweep for the real token", async () => {
    const summary = {
      scannedLines: 3,
      newPendingReview: 2,
      newNoCandidates: 1,
      emailSent: true,
    };
    mocks.runPosAttribution.mockResolvedValue(summary);
    const res = await request(buildApp())
      .post(POS_ATTRIBUTION_JOB_PATH)
      .send({ token: scheduledCallbackToken() });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(summary);
    // No tenantId argument: the nightly job sweeps every store.
    expect(mocks.runPosAttribution).toHaveBeenCalledWith();
  });

  it("refuses everything when no cookie secret exists to derive a token", async () => {
    ENV.cookieSecret = "";
    const res = await request(buildApp())
      .post(POS_ATTRIBUTION_JOB_PATH)
      .send({ token: "" });
    expect(res.status).toBe(403);
    expect(mocks.runPosAttribution).not.toHaveBeenCalled();
  });

  it("maps a failed run to a 500, not a hang", async () => {
    mocks.runPosAttribution.mockRejectedValue(new Error("db down"));
    const res = await request(buildApp())
      .post(POS_ATTRIBUTION_JOB_PATH)
      .send({ token: scheduledCallbackToken() });
    expect(res.status).toBe(500);
  });
});

describe("ensureDailyPosAttributionJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ENV.cookieSecret = "test-cookie-secret";
    ENV.forgeApiUrl = "https://forge.example";
    ENV.forgeApiKey = "forge-key";
  });

  it("does nothing when the heartbeat service is not configured", async () => {
    ENV.forgeApiUrl = "";
    await ensureDailyPosAttributionJob();
    expect(mocks.listHeartbeatJobs).not.toHaveBeenCalled();
    expect(mocks.createHeartbeatJob).not.toHaveBeenCalled();
  });

  it("does not re-create an existing job", async () => {
    mocks.listHeartbeatJobs.mockResolvedValue({
      total: 1,
      actorUserId: "owner",
      jobs: [{ name: POS_ATTRIBUTION_JOB_NAME }],
    });
    await ensureDailyPosAttributionJob();
    expect(mocks.createHeartbeatJob).not.toHaveBeenCalled();
  });

  it("creates the daily job with the derived token in its payload", async () => {
    mocks.listHeartbeatJobs.mockResolvedValue({
      total: 0,
      actorUserId: "owner",
      jobs: [],
    });
    mocks.createHeartbeatJob.mockResolvedValue({ taskUid: "t1" });
    await ensureDailyPosAttributionJob();
    expect(mocks.createHeartbeatJob).toHaveBeenCalledOnce();
    const [job] = mocks.createHeartbeatJob.mock.calls[0];
    expect(job.name).toBe(POS_ATTRIBUTION_JOB_NAME);
    expect(job.cron).toBe(POS_ATTRIBUTION_CRON);
    expect(job.path).toBe(POS_ATTRIBUTION_JOB_PATH);
    expect(job.payload).toEqual({ token: scheduledCallbackToken() });
  });

  it("survives a heartbeat-service failure without throwing", async () => {
    mocks.listHeartbeatJobs.mockRejectedValue(new Error("forge down"));
    await expect(ensureDailyPosAttributionJob()).resolves.toBeUndefined();
    expect(mocks.createHeartbeatJob).not.toHaveBeenCalled();
  });
});

describe("POST /api/scheduled/sheet-mirror", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ENV.cookieSecret = "test-cookie-secret";
    ENV.forgeApiUrl = "";
    ENV.forgeApiKey = "";
    mocks.isSheetsConfigured.mockReturnValue(true);
  });

  it("refuses a callback without the token", async () => {
    const res = await request(buildApp()).post(SHEET_MIRROR_JOB_PATH).send({});
    expect(res.status).toBe(403);
    expect(mocks.runSheetMirrorSweep).not.toHaveBeenCalled();
  });

  /**
   * The reason `scheduledCallbackToken` takes a job name. Both jobs' payloads
   * travel to the same external heartbeat service, so a token that leaked from
   * one must not authorise the other's endpoint.
   */
  it("refuses the OTHER job's token", async () => {
    const res = await request(buildApp())
      .post(SHEET_MIRROR_JOB_PATH)
      .send({ token: scheduledCallbackToken(POS_ATTRIBUTION_JOB_NAME) });
    expect(res.status).toBe(403);
    expect(mocks.runSheetMirrorSweep).not.toHaveBeenCalled();
  });

  it("runs the sweep for the real token and returns its summary", async () => {
    mocks.runSheetMirrorSweep.mockResolvedValue({
      attempted: 3,
      synced: 2,
      failed: 1,
    });
    const res = await request(buildApp())
      .post(SHEET_MIRROR_JOB_PATH)
      .send({ token: scheduledCallbackToken(SHEET_MIRROR_JOB_NAME) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ attempted: 3, synced: 2, failed: 1 });
  });

  it("refuses everything when no cookie secret exists to derive a token", async () => {
    ENV.cookieSecret = "";
    const res = await request(buildApp())
      .post(SHEET_MIRROR_JOB_PATH)
      .send({ token: "" });
    expect(res.status).toBe(403);
    expect(mocks.runSheetMirrorSweep).not.toHaveBeenCalled();
  });

  it("maps a failed sweep to a 500, not a hang", async () => {
    mocks.runSheetMirrorSweep.mockRejectedValue(new Error("quota exhausted"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await request(buildApp())
      .post(SHEET_MIRROR_JOB_PATH)
      .send({ token: scheduledCallbackToken(SHEET_MIRROR_JOB_NAME) });
    expect(res.status).toBe(500);
  });
});

describe("ensureSheetMirrorSyncJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ENV.cookieSecret = "test-cookie-secret";
    ENV.forgeApiUrl = "https://forge.example";
    ENV.forgeApiKey = "key";
    mocks.isSheetsConfigured.mockReturnValue(true);
    mocks.listHeartbeatJobs.mockResolvedValue({ jobs: [] });
  });

  it("does nothing when the heartbeat service is not configured", async () => {
    ENV.forgeApiUrl = "";
    await ensureSheetMirrorSyncJob();
    expect(mocks.createHeartbeatJob).not.toHaveBeenCalled();
  });

  /**
   * With no service account there can be no mirrors, so an hourly job that
   * sweeps nothing forever is noise — and it would be created on every
   * self-hosted install by default.
   */
  it("does not schedule anything when Google Sheets is unconfigured", async () => {
    mocks.isSheetsConfigured.mockReturnValue(false);
    await ensureSheetMirrorSyncJob();
    expect(mocks.createHeartbeatJob).not.toHaveBeenCalled();
    expect(mocks.listHeartbeatJobs).not.toHaveBeenCalled();
  });

  it("does not re-create an existing job", async () => {
    mocks.listHeartbeatJobs.mockResolvedValue({
      jobs: [{ name: SHEET_MIRROR_JOB_NAME }],
    });
    await ensureSheetMirrorSyncJob();
    expect(mocks.createHeartbeatJob).not.toHaveBeenCalled();
  });

  it("creates the hourly job with its own derived token", async () => {
    await ensureSheetMirrorSyncJob();
    expect(mocks.createHeartbeatJob).toHaveBeenCalledTimes(1);
    const [job] = mocks.createHeartbeatJob.mock.calls[0];
    expect(job.name).toBe(SHEET_MIRROR_JOB_NAME);
    expect(job.cron).toBe(SHEET_MIRROR_CRON);
    expect(job.path).toBe(SHEET_MIRROR_JOB_PATH);
    expect(job.payload).toEqual({
      token: scheduledCallbackToken(SHEET_MIRROR_JOB_NAME),
    });
    // Not the POS job's token — see the replay test above.
    expect(job.payload.token).not.toBe(
      scheduledCallbackToken(POS_ATTRIBUTION_JOB_NAME),
    );
  });

  it("survives a heartbeat-service failure without throwing", async () => {
    mocks.listHeartbeatJobs.mockRejectedValue(new Error("forge down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(ensureSheetMirrorSyncJob()).resolves.toBeUndefined();
  });
});
