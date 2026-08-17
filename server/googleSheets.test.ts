/**
 * Tests for the Google Sheets transport.
 *
 * `fetch` is stubbed, but the JWT is signed for real against a freshly
 * generated RSA key — the signing path is the one thing here that cannot be
 * asserted by inspection, and a key that fails to import produces an error
 * ("Invalid keyData") that says nothing about which of the two env vars is
 * malformed. Generating a key costs ~50ms once per file.
 */

import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SheetsError,
  a1,
  batchUpdateSpreadsheet,
  clearRanges,
  createSpreadsheet,
  unshareSpreadsheet,
  getAccessToken,
  getSpreadsheetMeta,
  isSheetsConfigured,
  readValues,
  resetSheetsAuthCache,
  shareSpreadsheet,
  writeValues,
} from "./googleSheets";

const { privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

type Call = { url: string; init: RequestInit };

let calls: Call[];
let fetchMock: ReturnType<typeof vi.fn>;

/** Queue one JSON response per expected fetch, oldest first. */
function respondWith(...bodies: unknown[]): void {
  for (const body of bodies) {
    fetchMock.mockImplementationOnce((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(body)),
        json: () => Promise.resolve(body),
      });
    });
  }
}

function tokenResponse(value = "ya29.token", expiresIn = 3600) {
  return { access_token: value, expires_in: expiresIn };
}

function body(call: Call): Record<string, unknown> {
  return JSON.parse(String(call.init.body));
}

beforeEach(() => {
  calls = [];
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv(
    "GOOGLE_SERVICE_ACCOUNT_EMAIL",
    "mirror@zolto.iam.gserviceaccount.com",
  );
  vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_KEY", privateKey as string);
  resetSheetsAuthCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetSheetsAuthCache();
});

describe("isSheetsConfigured", () => {
  it("is true only when both credentials are present", () => {
    expect(isSheetsConfigured()).toBe(true);

    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_KEY", "");
    expect(isSheetsConfigured()).toBe(false);

    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_KEY", privateKey as string);
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL", "");
    expect(isSheetsConfigured()).toBe(false);
  });

  it("accepts a PEM whose newlines were flattened to literal \\n", async () => {
    vi.stubEnv(
      "GOOGLE_SERVICE_ACCOUNT_KEY",
      (privateKey as string).replace(/\n/g, "\\n"),
    );
    respondWith(tokenResponse());
    await expect(getAccessToken()).resolves.toBe("ya29.token");
  });
});

describe("getAccessToken", () => {
  it("refuses with 503 when credentials are absent, without calling out", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL", "");
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_KEY", "");
    await expect(getAccessToken()).rejects.toThrow(SheetsError);
    await expect(getAccessToken()).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("trades a signed JWT bearer assertion for a token", async () => {
    respondWith(tokenResponse());
    await getAccessToken();

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://oauth2.googleapis.com/token");
    const params = new URLSearchParams(String(calls[0].init.body));
    expect(params.get("grant_type")).toBe(
      "urn:ietf:params:oauth:grant-type:jwt-bearer",
    );

    const assertion = params.get("assertion") ?? "";
    const [header, payload] = assertion
      .split(".")
      .slice(0, 2)
      .map((part) => JSON.parse(Buffer.from(part, "base64url").toString()));
    expect(header.alg).toBe("RS256");
    expect(payload.iss).toBe("mirror@zolto.iam.gserviceaccount.com");
    expect(payload.aud).toBe("https://oauth2.googleapis.com/token");
    expect(payload.scope).toContain(
      "https://www.googleapis.com/auth/spreadsheets",
    );
    // The narrow Drive scope: access to files this service account created,
    // never the rest of any Drive.
    expect(payload.scope).toContain(
      "https://www.googleapis.com/auth/drive.file",
    );
    expect(payload.exp - payload.iat).toBe(3600);
  });

  it("memoises the token across calls", async () => {
    respondWith(tokenResponse());
    await getAccessToken();
    await getAccessToken();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-exchanges once the token is inside the expiry skew", async () => {
    // 30s lifetime is inside the 60s skew, so it is never considered fresh.
    respondWith(tokenResponse("first", 30), tokenResponse("second", 3600));
    expect(await getAccessToken()).toBe("first");
    expect(await getAccessToken()).toBe("second");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces the upstream status on a rejected grant", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve('{"error":"invalid_grant"}'),
    });
    await expect(getAccessToken()).rejects.toMatchObject({
      status: 401,
      name: "SheetsError",
    });
  });

  it("does not cache a failed exchange", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve(""),
    });
    await expect(getAccessToken()).rejects.toThrow(SheetsError);
    respondWith(tokenResponse("recovered"));
    expect(await getAccessToken()).toBe("recovered");
  });
});

describe("a1", () => {
  it("quotes the tab title so a space is not a syntax error", () => {
    expect(a1("Stock In", "A1:E100")).toBe("'Stock In'!A1:E100");
  });

  it("escapes an embedded quote by doubling it", () => {
    expect(a1("Sam's tab", "A1")).toBe("'Sam''s tab'!A1");
  });
});

describe("createSpreadsheet", () => {
  it("creates the tabs in order and maps their numeric ids", async () => {
    respondWith(tokenResponse(), {
      spreadsheetId: "sheet-1",
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet-1/edit",
      sheets: [
        { properties: { title: "Sales", sheetId: 0 } },
        { properties: { title: "Inventory", sheetId: 11 } },
      ],
    });

    const created = await createSpreadsheet("Zolto — Acme", [
      "Sales",
      "Inventory",
    ]);
    expect(created).toEqual({
      spreadsheetId: "sheet-1",
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet-1/edit",
      sheetIds: { Sales: 0, Inventory: 11 },
    });

    const sent = body(calls[1]);
    expect(sent.properties).toEqual({ title: "Zolto — Acme" });
    expect(sent.sheets).toEqual([
      { properties: { title: "Sales", index: 0 } },
      { properties: { title: "Inventory", index: 1 } },
    ]);
  });

  it("falls back to a derived URL when the API omits one", async () => {
    respondWith(tokenResponse(), { spreadsheetId: "sheet-2" });
    const created = await createSpreadsheet("t", []);
    expect(created.spreadsheetUrl).toBe(
      "https://docs.google.com/spreadsheets/d/sheet-2/edit",
    );
    expect(created.sheetIds).toEqual({});
  });
});

describe("getSpreadsheetMeta", () => {
  it("reads the tab id map off an existing spreadsheet", async () => {
    respondWith(tokenResponse(), {
      sheets: [
        { properties: { title: "Sales", sheetId: 0 } },
        { properties: { title: "Stock In", sheetId: 42 } },
        // A tab mid-rename can come back without an id; skipping it is better
        // than writing `undefined` into a map every batchUpdate reads from.
        { properties: { title: "Broken" } },
      ],
    });
    const meta = await getSpreadsheetMeta("sheet-1");
    expect(meta.sheetIds).toEqual({ Sales: 0, "Stock In": 42 });
    expect(meta.protectedRangeIds).toEqual([]);
  });

  it("collects existing protected-range ids so they can be replaced, not stacked", async () => {
    respondWith(tokenResponse(), {
      sheets: [
        {
          properties: { title: "Sales", sheetId: 0 },
          protectedRanges: [{ protectedRangeId: 7 }],
        },
        {
          properties: { title: "Inventory", sheetId: 1 },
          protectedRanges: [{ protectedRangeId: 8 }, {}],
        },
      ],
    });
    const meta = await getSpreadsheetMeta("sheet-1");
    expect(meta.protectedRangeIds).toEqual([7, 8]);
  });
});

describe("readValues", () => {
  it("asks for unformatted values and tolerates an empty tab", async () => {
    respondWith(tokenResponse(), {});
    expect(await readValues("sheet-1", "'Stock In'!A1:E10")).toEqual([]);
    expect(calls[1].url).toContain("valueRenderOption=UNFORMATTED_VALUE");
    expect(calls[1].url).toContain(encodeURIComponent("'Stock In'!A1:E10"));
  });

  it("returns the row grid as given", async () => {
    respondWith(tokenResponse(), {
      values: [
        ["id", "qty"],
        ["7", "3"],
      ],
    });
    expect(await readValues("sheet-1", "A1:B2")).toEqual([
      ["id", "qty"],
      ["7", "3"],
    ]);
  });
});

describe("writeValues", () => {
  it("writes RAW so a SKU is never parsed into a date or a formula", async () => {
    respondWith(tokenResponse(), {});
    await writeValues("sheet-1", [
      {
        range: "'Inventory'!A1:B2",
        values: [
          ["SEPT1", "=1+1"],
          ["x", 2],
        ],
      },
    ]);
    const sent = body(calls[1]);
    expect(sent.valueInputOption).toBe("RAW");
    expect(sent.data).toEqual([
      {
        range: "'Inventory'!A1:B2",
        values: [
          ["SEPT1", "=1+1"],
          ["x", 2],
        ],
      },
    ]);
  });

  it("skips the round trip when there is nothing to write", async () => {
    await writeValues("sheet-1", []);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("clearRanges", () => {
  it("batch-clears the given ranges", async () => {
    respondWith(tokenResponse(), {});
    await clearRanges("sheet-1", ["'Sales'!A2:H", "'Inventory'!A2:G"]);
    expect(calls[1].url).toContain("values:batchClear");
    expect(body(calls[1])).toEqual({
      ranges: ["'Sales'!A2:H", "'Inventory'!A2:G"],
    });
  });

  it("skips the round trip when there is nothing to clear", async () => {
    await clearRanges("sheet-1", []);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("batchUpdateSpreadsheet", () => {
  it("posts the structural requests", async () => {
    respondWith(tokenResponse(), {});
    await batchUpdateSpreadsheet("sheet-1", [{ addProtectedRange: {} }]);
    expect(calls[1].url).toContain("sheet-1:batchUpdate");
    expect(body(calls[1])).toEqual({ requests: [{ addProtectedRange: {} }] });
  });

  it("skips the round trip on an empty request list", async () => {
    await batchUpdateSpreadsheet("sheet-1", []);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("shareSpreadsheet", () => {
  it("grants the named role to the merchant and notifies them", async () => {
    respondWith(tokenResponse(), {});
    await shareSpreadsheet("sheet-1", "shop@example.com", "reader");
    expect(calls[1].url).toContain("sendNotificationEmail=true");
    expect(body(calls[1])).toEqual({
      type: "user",
      role: "reader",
      emailAddress: "shop@example.com",
    });
  });
});

describe("unshareSpreadsheet", () => {
  /** Drive returns 204 with no body for a successful permission delete. */
  function emptyResponse() {
    fetchMock.mockImplementationOnce((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve({
        ok: true,
        status: 204,
        text: () => Promise.resolve(""),
      });
    });
  }

  it("looks the permission up by address, then deletes just that one", async () => {
    respondWith(tokenResponse(), {
      permissions: [
        {
          id: "owner-perm",
          emailAddress: "mirror@zolto.iam.gserviceaccount.com",
        },
        { id: "merchant-perm", emailAddress: "shop@example.com" },
      ],
    });
    emptyResponse();

    await unshareSpreadsheet("sheet-1", "shop@example.com");

    expect(calls[1].url).toContain("/permissions");
    expect(calls[2].url).toContain("/permissions/merchant-perm");
    expect(calls[2].init.method).toBe("DELETE");
  });

  /**
   * The file itself must survive — deleting it would destroy the merchant's
   * sales history from one button press, which is the whole reason a disconnect
   * unshares instead.
   */
  it("never deletes the file itself", async () => {
    respondWith(tokenResponse(), {
      permissions: [{ id: "merchant-perm", emailAddress: "shop@example.com" }],
    });
    emptyResponse();

    await unshareSpreadsheet("sheet-1", "shop@example.com");

    for (const call of calls) {
      if (call.init.method !== "DELETE") continue;
      // A file delete is DELETE on …/files/{id} with no /permissions segment.
      expect(call.url).toContain("/permissions/");
    }
  });

  it("matches the address case-insensitively and ignoring surrounding space", async () => {
    respondWith(tokenResponse(), {
      permissions: [{ id: "merchant-perm", emailAddress: "Shop@Example.com" }],
    });
    emptyResponse();
    await unshareSpreadsheet("sheet-1", "  shop@example.com ");
    expect(calls[2].url).toContain("/permissions/merchant-perm");
  });

  /**
   * Already-unshared is the state we were trying to reach, so it is success —
   * a merchant who removed the file from their own Drive first must not make
   * Disconnect fail.
   */
  it("is a no-op when no permission matches", async () => {
    respondWith(tokenResponse(), {
      permissions: [{ id: "someone-else", emailAddress: "other@example.com" }],
    });
    await expect(
      unshareSpreadsheet("sheet-1", "shop@example.com"),
    ).resolves.toBeUndefined();
    // Only the token exchange and the list — no delete.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("tolerates a permissions list Drive returned without the field", async () => {
    respondWith(tokenResponse(), {});
    await expect(
      unshareSpreadsheet("sheet-1", "shop@example.com"),
    ).resolves.toBeUndefined();
  });
});

describe("error mapping", () => {
  it("wraps an API failure as SheetsError carrying the status", async () => {
    respondWith(tokenResponse());
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: () =>
        Promise.resolve('{"error":{"message":"caller lacks access"}}'),
    });
    await expect(readValues("sheet-1", "A1")).rejects.toMatchObject({
      name: "SheetsError",
      status: 403,
    });
  });
});
