import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { ENV } = vi.hoisted(() => ({
  ENV: { forgeApiUrl: "", forgeApiKey: "" } as {
    forgeApiUrl: string;
    forgeApiKey: string;
  },
}));

vi.mock("./env", () => ({ ENV }));

import { callDataApi } from "./dataApi";

beforeEach(() => {
  ENV.forgeApiUrl = "https://forge.example";
  ENV.forgeApiKey = "forge-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("callDataApi", () => {
  it("throws when the forge URL is not configured", async () => {
    ENV.forgeApiUrl = "";
    await expect(callDataApi("Svc/op")).rejects.toThrow(/FORGE_API_URL/);
  });

  it("throws when the forge key is not configured", async () => {
    ENV.forgeApiKey = "";
    await expect(callDataApi("Svc/op")).rejects.toThrow(/FORGE_API_KEY/);
  });

  it("parses jsonData JSON payloads", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ jsonData: JSON.stringify({ hits: 3 }) }),
    }));
    vi.stubGlobal("fetch", fetchSpy);
    const result = await callDataApi("Youtube/search", {
      query: { q: "manus" },
    });
    expect(result).toEqual({ hits: 3 });
    // The base URL is normalised with a trailing slash before appending.
    expect(fetchSpy.mock.calls[0][0].toString()).toContain(
      "webdevtoken.v1.WebDevService/CallApi",
    );
  });

  it("returns the raw jsonData when it isn't valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ jsonData: "plain" }),
      })),
    );
    expect(await callDataApi("Svc/op")).toBe("plain");
  });

  it("returns the payload as-is when there is no jsonData field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ foo: "bar" }) })),
    );
    expect(await callDataApi("Svc/op")).toEqual({ foo: "bar" });
  });

  it("appends the path without doubling the slash when the base ends in /", async () => {
    ENV.forgeApiUrl = "https://forge.example/";
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchSpy);
    await callDataApi("Svc/op");
    expect(fetchSpy.mock.calls[0][0].toString()).toBe(
      "https://forge.example/webdevtoken.v1.WebDevService/CallApi",
    );
  });

  it("throws with detail when the request is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        statusText: "Server Error",
        text: async () => "boom",
      })),
    );
    await expect(callDataApi("Svc/op")).rejects.toThrow(
      /500 Server Error.*boom/,
    );
  });
});
