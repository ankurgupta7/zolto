import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { notifyOwner } from "./notification";

const ENV_KEYS = ["DISCORD_BOT_TOKEN", "DISCORD_OWNER_USER_ID"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("notifyOwner", () => {
  it("logs and returns true when no owner id is configured", async () => {
    delete process.env.DISCORD_OWNER_USER_ID;
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const ok = await notifyOwner({ title: "Hi", content: "there" });
    expect(ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Hi"));
  });

  it("opens a DM channel and sends the message", async () => {
    process.env.DISCORD_OWNER_USER_ID = "owner-1";
    process.env.DISCORD_BOT_TOKEN = "bot-token";
    const fetchSpy = vi.fn(async (url: string) => {
      if (url.endsWith("/users/@me/channels")) {
        return { ok: true, json: async () => ({ id: "dm-chan" }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchSpy);

    const ok = await notifyOwner({ title: "New order", content: "CHF 99" });
    expect(ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const secondUrl = fetchSpy.mock.calls[1][0] as string;
    expect(secondUrl).toContain("/channels/dm-chan/messages");
    const secondBody = JSON.parse(
      (fetchSpy.mock.calls[1][1] as { body: string }).body,
    );
    expect(secondBody.content).toContain("New order");
  });

  it("returns false when the bot token is missing", async () => {
    process.env.DISCORD_OWNER_USER_ID = "owner-1";
    delete process.env.DISCORD_BOT_TOKEN;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ok = await notifyOwner({ title: "x", content: "y" });
    expect(ok).toBe(false);
  });

  it("returns false when opening the DM channel fails", async () => {
    process.env.DISCORD_OWNER_USER_ID = "owner-1";
    process.env.DISCORD_BOT_TOKEN = "bot-token";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        text: async () => "no access",
      })),
    );
    const ok = await notifyOwner({ title: "x", content: "y" });
    expect(ok).toBe(false);
  });

  it("returns false when sending the message fails", async () => {
    process.env.DISCORD_OWNER_USER_ID = "owner-1";
    process.env.DISCORD_BOT_TOKEN = "bot-token";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/users/@me/channels")) {
          return { ok: true, json: async () => ({ id: "dm-chan" }) };
        }
        return {
          ok: false,
          status: 500,
          statusText: "Server Error",
          text: async () => "boom",
        };
      }),
    );
    const ok = await notifyOwner({ title: "x", content: "y" });
    expect(ok).toBe(false);
  });
});
