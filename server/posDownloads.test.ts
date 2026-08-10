import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getPosDownloads,
  clearPosDownloadsCache,
  releaseRepo,
  releaseTag,
} from "./posDownloads";

const ORIGINAL_ENV = { ...process.env };

function releaseBody(assets: Array<Partial<Record<string, unknown>>>) {
  return { assets };
}

function asset(name: string, over: Record<string, unknown> = {}) {
  return {
    name,
    size: 12_345,
    updated_at: "2026-08-09T10:00:00Z",
    browser_download_url: `https://github.com/ankurgupta7/zolto/releases/download/pos-latest/${name}`,
    ...over,
  };
}

/**
 * Stubs global fetch with a router keyed on URL substring. Anything unmatched
 * resolves to a 404, which is what a missing sidecar looks like.
 */
function stubFetch(routes: Array<[string, unknown, number?]>) {
  const calls: string[] = [];
  const fn = vi.fn(async (url: string | URL) => {
    const u = String(url);
    calls.push(u);
    for (const [needle, body, status] of routes) {
      if (u.includes(needle)) {
        return {
          ok: (status ?? 200) < 400,
          status: status ?? 200,
          json: async () => body,
        } as Response;
      }
    }
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  });
  vi.stubGlobal("fetch", fn);
  return { calls, fn };
}

beforeEach(() => {
  clearPosDownloadsCache();
  delete process.env.POS_ANDROID_URL;
  delete process.env.POS_IOS_URL;
  delete process.env.POS_RELEASE_REPO;
  delete process.env.POS_RELEASE_TAG;
  delete process.env.GITHUB_TOKEN;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
  clearPosDownloadsCache();
});

describe("posDownloads — release coordinates", () => {
  it("defaults to the public repo and the rolling tag", () => {
    expect(releaseRepo()).toBe("ankurgupta7/zolto");
    expect(releaseTag()).toBe("pos-latest");
  });

  it("lets a self-hoster point at their own repo and tag", () => {
    process.env.POS_RELEASE_REPO = "acme/zolto-fork";
    process.env.POS_RELEASE_TAG = "pos-stable";
    expect(releaseRepo()).toBe("acme/zolto-fork");
    expect(releaseTag()).toBe("pos-stable");
  });

  it("ignores a malformed repo rather than building a bogus URL", () => {
    // A typo like a full URL instead of owner/repo would otherwise produce
    // https://github.com/https://github.com/... and a broken download button.
    process.env.POS_RELEASE_REPO = "https://github.com/acme/zolto";
    expect(releaseRepo()).toBe("ankurgupta7/zolto");
  });
});

describe("posDownloads — published build", () => {
  it("returns both links stamped with size, build time and commit", async () => {
    stubFetch([
      [
        "api.github.com",
        releaseBody([
          asset("ZoltoPOS-latest.apk", { size: 9_000_000 }),
          asset("ZoltoPOS-latest-unsigned.ipa", { size: 21_000_000 }),
          asset("android-build.json"),
          asset("ios-build.json"),
        ]),
      ],
      [
        "android-build.json",
        { commit: "3f2a1bcdeadbeef", platform: "android" },
      ],
      ["ios-build.json", { commit: "abcdef1234567", platform: "ios" }],
    ]);

    const d = await getPosDownloads();

    expect(d.android).toMatchObject({
      url: expect.stringContaining("ZoltoPOS-latest.apk"),
      sizeBytes: 9_000_000,
      builtAt: "2026-08-09T10:00:00Z",
      commit: "3f2a1bc",
    });
    expect(d.ios).toMatchObject({
      url: expect.stringContaining("ZoltoPOS-latest-unsigned.ipa"),
      sizeBytes: 21_000_000,
      commit: "abcdef1",
    });
  });

  it("flags the unsigned IPA as needing a sideload, and the APK as not", async () => {
    // This is the whole reason the flag exists: the merchant must be told the
    // iOS file cannot just be tapped.
    stubFetch([
      [
        "api.github.com",
        releaseBody([
          asset("ZoltoPOS-latest.apk"),
          asset("ZoltoPOS-latest-unsigned.ipa"),
        ]),
      ],
    ]);

    const d = await getPosDownloads();
    expect(d.android?.requiresSideload).toBe(false);
    expect(d.ios?.requiresSideload).toBe(true);
  });

  it("still returns the link when the sidecar JSON is missing", async () => {
    stubFetch([
      ["api.github.com", releaseBody([asset("ZoltoPOS-latest.apk")])],
    ]);
    const d = await getPosDownloads();
    expect(d.android?.url).toContain("ZoltoPOS-latest.apk");
    expect(d.android?.commit).toBeUndefined();
  });
});

describe("posDownloads — not published vs. couldn't ask", () => {
  it("reports null for a platform GitHub says has no asset", async () => {
    // Before the first iOS publish the merchant must see "not published yet",
    // not a button that 404s.
    stubFetch([
      ["api.github.com", releaseBody([asset("ZoltoPOS-latest.apk")])],
    ]);
    const d = await getPosDownloads();
    expect(d.android).not.toBeNull();
    expect(d.ios).toBeNull();
  });

  it("still offers both links when GitHub cannot be reached", async () => {
    // Degrade, don't hide: a rate-limited API call must not remove a download
    // that actually works.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNRESET");
      }),
    );
    const d = await getPosDownloads();
    expect(d.android?.url).toContain("ZoltoPOS-latest.apk");
    expect(d.ios?.url).toContain("ZoltoPOS-latest-unsigned.ipa");
    expect(d.android?.builtAt).toBeUndefined();
  });

  it("does not throw when GitHub returns a rate-limit error", async () => {
    stubFetch([
      ["api.github.com", { message: "API rate limit exceeded" }, 403],
    ]);
    await expect(getPosDownloads()).resolves.toBeTruthy();
  });

  it("survives a release payload that is not the shape we expect", async () => {
    stubFetch([["api.github.com", { assets: "not-an-array" }]]);
    const d = await getPosDownloads();
    expect(d.android?.url).toContain("ZoltoPOS-latest.apk");
  });
});

describe("posDownloads — operator overrides", () => {
  it("prefers POS_ANDROID_URL / POS_IOS_URL over the release", async () => {
    process.env.POS_ANDROID_URL =
      "https://play.google.com/store/apps/details?id=ch.zolto.pos";
    process.env.POS_IOS_URL = "https://testflight.apple.com/join/abc123";
    const { fn } = stubFetch([["api.github.com", releaseBody([])]]);

    const d = await getPosDownloads();

    expect(d.android?.url).toContain("play.google.com");
    expect(d.ios?.url).toContain("testflight.apple.com");
    // Both overridden — no reason to call GitHub at all.
    expect(fn).not.toHaveBeenCalled();
  });

  it("treats a TestFlight override as installable, not a sideload", async () => {
    process.env.POS_ANDROID_URL = "https://example.test/a.apk";
    process.env.POS_IOS_URL = "https://testflight.apple.com/join/abc123";
    stubFetch([]);
    const d = await getPosDownloads();
    expect(d.ios?.requiresSideload).toBe(false);
  });

  it("treats a self-hosted .ipa override as a sideload", async () => {
    process.env.POS_ANDROID_URL = "https://example.test/a.apk";
    process.env.POS_IOS_URL = "https://mdm.example.test/builds/ZoltoPOS.ipa";
    stubFetch([]);
    const d = await getPosDownloads();
    expect(d.ios?.requiresSideload).toBe(true);
  });
});

describe("posDownloads — caching", () => {
  it("asks GitHub once across repeated calls", async () => {
    const { fn } = stubFetch([
      ["api.github.com", releaseBody([asset("ZoltoPOS-latest.apk")])],
    ]);

    await getPosDownloads();
    await getPosDownloads();
    await getPosDownloads();

    const apiCalls = fn.mock.calls.filter((c) =>
      String(c[0]).includes("api.github.com"),
    );
    expect(apiCalls).toHaveLength(1);
  });

  it("asks again once the cache is cleared", async () => {
    const { fn } = stubFetch([
      ["api.github.com", releaseBody([asset("ZoltoPOS-latest.apk")])],
    ]);
    await getPosDownloads();
    clearPosDownloadsCache();
    await getPosDownloads();

    const apiCalls = fn.mock.calls.filter((c) =>
      String(c[0]).includes("api.github.com"),
    );
    expect(apiCalls).toHaveLength(2);
  });
});

describe("posDownloads — request shape", () => {
  it("authenticates when GITHUB_TOKEN is available", async () => {
    process.env.GITHUB_TOKEN = "ghp_example";
    const { fn } = stubFetch([["api.github.com", releaseBody([])]]);
    await getPosDownloads();
    const init = fn.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer ghp_example",
    );
  });

  it("sends no authorization header when there is no token", async () => {
    const { fn } = stubFetch([["api.github.com", releaseBody([])]]);
    await getPosDownloads();
    const init = fn.mock.calls[0][1] as RequestInit;
    expect(
      (init.headers as Record<string, string>).authorization,
    ).toBeUndefined();
  });
});
