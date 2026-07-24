import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { ENV } = vi.hoisted(() => ({
  ENV: { forgeApiUrl: "", forgeApiKey: "" } as {
    forgeApiUrl: string;
    forgeApiKey: string;
  },
}));

vi.mock("./env", () => ({ ENV }));

import { makeRequest } from "./map";

beforeEach(() => {
  ENV.forgeApiUrl = "https://forge.example/";
  ENV.forgeApiKey = "maps-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("map.makeRequest", () => {
  it("throws when credentials are missing", async () => {
    ENV.forgeApiKey = "";
    await expect(makeRequest("/maps/api/geocode/json")).rejects.toThrow(
      /credentials missing/,
    );
  });

  it("builds a proxied URL with the key and skips null/undefined params", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ status: "OK", results: [] }),
    }));
    vi.stubGlobal("fetch", fetchSpy);

    const res = await makeRequest("/maps/api/geocode/json", {
      address: "Zurich",
      region: undefined,
      extra: null,
    });
    expect(res).toMatchObject({ status: "OK" });

    const url = new URL(fetchSpy.mock.calls[0][0]);
    // trailing slash on the base is normalised away before /v1/maps/proxy
    expect(url.pathname).toBe("/v1/maps/proxy/maps/api/geocode/json");
    expect(url.searchParams.get("key")).toBe("maps-key");
    expect(url.searchParams.get("address")).toBe("Zurich");
    expect(url.searchParams.has("region")).toBe(false);
    expect(url.searchParams.has("extra")).toBe(false);
  });

  it("issues a POST with a JSON body when requested", async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchSpy);
    await makeRequest(
      "/v1/snapToRoads",
      {},
      { method: "POST", body: { path: "x" } },
    );
    const init = fetchSpy.mock.calls[0][1];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ path: "x" });
  });

  it("throws with status detail when the response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        text: async () => "denied",
      })),
    );
    await expect(makeRequest("/maps/api/geocode/json")).rejects.toThrow(
      /Google Maps API request failed .*403.*denied/,
    );
  });
});
