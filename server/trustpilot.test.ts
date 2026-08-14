import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  clearTrustpilotCache,
  fetchTrustpilotSummary,
  isTrustpilotConfigured,
  TRUSTPILOT_CACHE_TTL_MS,
  TRUSTPILOT_FAILURE_TTL_MS,
} from "./trustpilot";

const OK_BODY = {
  id: "abc123",
  displayName: "Kalakosh",
  score: { stars: 4.5, trustScore: 4.6 },
  numberOfReviews: { total: 128 },
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  clearTrustpilotCache();
  process.env.TRUSTPILOT_API_KEY = "test-key";
  fetchMock = vi.fn().mockResolvedValue(jsonResponse(OK_BODY));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.TRUSTPILOT_API_KEY;
});

describe("isTrustpilotConfigured", () => {
  it("is false without a platform API key", () => {
    delete process.env.TRUSTPILOT_API_KEY;
    expect(isTrustpilotConfigured()).toBe(false);
  });

  it("is true with one", () => {
    expect(isTrustpilotConfigured()).toBe(true);
  });
});

describe("fetchTrustpilotSummary", () => {
  it("maps Trustpilot's business unit onto the storefront summary", async () => {
    const summary = await fetchTrustpilotSummary("kalakosh.ch");
    expect(summary).toEqual({
      domain: "kalakosh.ch",
      displayName: "Kalakosh",
      stars: 4.5,
      trustScore: 4.6,
      numberOfReviews: 128,
      profileUrl: "https://ch.trustpilot.com/review/kalakosh.ch",
    });
  });

  it("sends the platform key as a header and never in the URL", async () => {
    await fetchTrustpilotSummary("kalakosh.ch");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("business-units/find?name=kalakosh.ch");
    expect(url).not.toContain("test-key");
    expect((init.headers as Record<string, string>).apikey).toBe("test-key");
  });

  it("normalises what the merchant saved before looking it up", async () => {
    await fetchTrustpilotSummary("https://www.KalaKosh.ch/shop");
    expect(fetchMock.mock.calls[0][0]).toContain("name=kalakosh.ch");
  });

  it("returns null without an API key, and makes no request", async () => {
    delete process.env.TRUSTPILOT_API_KEY;
    expect(await fetchTrustpilotSummary("kalakosh.ch")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null for a store with no Trustpilot domain", async () => {
    expect(await fetchTrustpilotSummary(null)).toBeNull();
    expect(await fetchTrustpilotSummary("not a domain")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null for an unknown business unit (404) without shouting about it", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 404));
    expect(await fetchTrustpilotSummary("kalakosh.ch")).toBeNull();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("logs anything other than a 404", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));
    expect(await fetchTrustpilotSummary("kalakosh.ch")).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });

  it("survives a network failure with a null rather than a thrown 500", async () => {
    fetchMock.mockRejectedValue(new Error("socket hang up"));
    await expect(fetchTrustpilotSummary("kalakosh.ch")).resolves.toBeNull();
  });

  it("survives a shape it does not recognise", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ unexpected: true }));
    expect(await fetchTrustpilotSummary("kalakosh.ch")).toBeNull();
  });

  it("shows nothing rather than '0.0 from 0 reviews' for an unreviewed store", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        score: { trustScore: 0, stars: 0 },
        numberOfReviews: { total: 0 },
      }),
    );
    expect(await fetchTrustpilotSummary("kalakosh.ch")).toBeNull();
  });

  it("accepts numberOfReviews as a bare number too", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ...OK_BODY, numberOfReviews: 42 }),
    );
    expect((await fetchTrustpilotSummary("kalakosh.ch"))?.numberOfReviews).toBe(
      42,
    );
  });

  it("falls back to the trust score when Trustpilot omits the star figure", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ...OK_BODY, score: { trustScore: 4.6 } }),
    );
    expect((await fetchTrustpilotSummary("kalakosh.ch"))?.stars).toBe(4.6);
  });

  describe("caching", () => {
    it("keeps a third-party API out of the critical path of every page view", async () => {
      await fetchTrustpilotSummary("kalakosh.ch");
      await fetchTrustpilotSummary("kalakosh.ch");
      await fetchTrustpilotSummary("https://www.kalakosh.ch");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("re-fetches once the entry goes stale", async () => {
      const t0 = 1_000_000;
      await fetchTrustpilotSummary("kalakosh.ch", { now: t0 });
      await fetchTrustpilotSummary("kalakosh.ch", {
        now: t0 + TRUSTPILOT_CACHE_TTL_MS + 1,
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("remembers a failure only briefly, so a just-connected profile appears soon", async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, 404));
      const t0 = 2_000_000;
      await fetchTrustpilotSummary("kalakosh.ch", { now: t0 });
      // Still inside the failure window: no second call.
      await fetchTrustpilotSummary("kalakosh.ch", {
        now: t0 + TRUSTPILOT_FAILURE_TTL_MS - 1,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      fetchMock.mockResolvedValue(jsonResponse(OK_BODY));
      const summary = await fetchTrustpilotSummary("kalakosh.ch", {
        now: t0 + TRUSTPILOT_FAILURE_TTL_MS + 1,
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(summary?.trustScore).toBe(4.6);
    });

    it("caches per store, not globally", async () => {
      await fetchTrustpilotSummary("kalakosh.ch");
      await fetchTrustpilotSummary("another-shop.ch");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
