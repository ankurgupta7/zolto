import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";

const { ENV } = vi.hoisted(() => ({
  ENV: { forgeApiUrl: "", forgeApiKey: "" } as {
    forgeApiUrl: string;
    forgeApiKey: string;
  },
}));

vi.mock("./env", () => ({ ENV }));

import {
  createHeartbeatJob,
  updateHeartbeatJob,
  deleteHeartbeatJob,
  listHeartbeatJobs,
} from "./heartbeat";

function okFetch(json: unknown = {}) {
  const spy = vi.fn(async () => ({ ok: true, json: async () => json }));
  vi.stubGlobal("fetch", spy);
  return spy;
}

function errFetch(status: number, detail = "boom") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: false,
      status,
      text: async () => detail,
    })),
  );
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    throw new Error("expected rejection");
  } catch (err) {
    return (err as TRPCError).code;
  }
}

const JOB = {
  name: "daily",
  cron: "0 0 9 * * *",
  path: "/api/scheduled/daily",
};

beforeEach(() => {
  vi.clearAllMocks();
  ENV.forgeApiUrl = "https://forge.example";
  ENV.forgeApiKey = "forge-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("configuration guards", () => {
  it("fails when the forge URL is unset", async () => {
    ENV.forgeApiUrl = "";
    expect(await codeOf(createHeartbeatJob(JOB, ""))).toBe(
      "INTERNAL_SERVER_ERROR",
    );
  });

  it("fails when the forge key is unset", async () => {
    ENV.forgeApiKey = "";
    expect(await codeOf(createHeartbeatJob(JOB, ""))).toBe(
      "INTERNAL_SERVER_ERROR",
    );
  });

  it("rejects a callback path outside /api/scheduled/", async () => {
    expect(
      await codeOf(createHeartbeatJob({ ...JOB, path: "/nope" }, "")),
    ).toBe("BAD_REQUEST");
  });
});

describe("createHeartbeatJob", () => {
  it("posts the job and returns the assigned taskUid", async () => {
    const fetchSpy = okFetch({ taskUid: "task-1", nextExecutionAt: "soon" });
    const res = await createHeartbeatJob(
      { ...JOB, payload: { hello: "world" }, description: "d" },
      "sess-123",
    );
    expect(res.taskUid).toBe("task-1");

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      "https://forge.example/webdevtoken.v1.WebDevService/CreateHeartbeatJob",
    );
    expect(init.headers["x-manus-user-session"]).toBe("sess-123");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      name: "daily",
      callbackMethod: "POST",
      callbackPayload: JSON.stringify({ hello: "world" }),
    });
  });

  it("omits the user-session header when the session is empty", async () => {
    const fetchSpy = okFetch({ taskUid: "t" });
    await createHeartbeatJob(JOB, "");
    const init = fetchSpy.mock.calls[0][1];
    expect(init.headers["x-manus-user-session"]).toBeUndefined();
    // Default payload serialises to "{}".
    expect(JSON.parse(init.body).callbackPayload).toBe("{}");
  });

  it("passes a string payload through unchanged", async () => {
    const fetchSpy = okFetch({ taskUid: "t" });
    await createHeartbeatJob({ ...JOB, payload: "raw-string" }, "");
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).callbackPayload).toBe(
      "raw-string",
    );
  });
});

describe("updateHeartbeatJob", () => {
  it("builds a patch body from the provided fields only", async () => {
    const fetchSpy = okFetch({ nextExecutionAt: "later" });
    await updateHeartbeatJob(
      "task-1",
      {
        cron: "0 0 * * * *",
        enable: false,
        payload: { a: 1 },
        description: "x",
      },
      "sess",
    );
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body).toEqual({
      taskUid: "task-1",
      cronExpression: "0 0 * * * *",
      callbackPayload: JSON.stringify({ a: 1 }),
      description: "x",
      enable: false,
    });
  });

  it("validates a new callback path", async () => {
    expect(await codeOf(updateHeartbeatJob("t", { path: "/bad" }, ""))).toBe(
      "BAD_REQUEST",
    );
  });

  it("includes method and path when supplied", async () => {
    const fetchSpy = okFetch({});
    await updateHeartbeatJob(
      "t",
      { path: "/api/scheduled/x", method: "PUT" },
      "",
    );
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.callbackPath).toBe("/api/scheduled/x");
    expect(body.callbackMethod).toBe("PUT");
  });
});

describe("deleteHeartbeatJob & listHeartbeatJobs", () => {
  it("deletes by taskUid", async () => {
    const fetchSpy = okFetch({});
    await deleteHeartbeatJob("task-1", "sess");
    expect(fetchSpy.mock.calls[0][0]).toContain("DeleteHeartbeatJob");
  });

  it("lists jobs with pagination", async () => {
    const fetchSpy = okFetch({ total: 1, actorUserId: "u", jobs: [] });
    const res = await listHeartbeatJobs("sess", { page: 2, pageSize: 50 });
    expect(res.total).toBe(1);
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toEqual({
      page: 2,
      pageSize: 50,
    });
  });

  it("lists jobs without pagination", async () => {
    const fetchSpy = okFetch({ total: 0, actorUserId: "u", jobs: [] });
    await listHeartbeatJobs("sess");
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toEqual({});
  });
});

describe("forge error mapping", () => {
  it.each([
    [401, "UNAUTHORIZED"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [400, "BAD_REQUEST"],
    [422, "BAD_REQUEST"],
    [409, "CONFLICT"],
    [429, "TOO_MANY_REQUESTS"],
    [500, "INTERNAL_SERVER_ERROR"],
  ])("maps HTTP %i to %s", async (status, expected) => {
    errFetch(status);
    expect(await codeOf(deleteHeartbeatJob("t", "sess"))).toBe(expected);
  });

  it("wraps a network error as INTERNAL_SERVER_ERROR", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    expect(await codeOf(deleteHeartbeatJob("t", "sess"))).toBe(
      "INTERNAL_SERVER_ERROR",
    );
  });
});
