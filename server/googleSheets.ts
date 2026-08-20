/**
 * Google Sheets/Drive transport — the thinnest client that covers what the
 * spreadsheet mirror needs, and nothing else.
 *
 * Why hand-rolled rather than `googleapis`: that package is ~50MB of generated
 * surface for the five calls below, and it pulls its own auth stack. `jose` is
 * already a dependency (it signs magic-link tokens), and a service-account
 * grant is one signed JWT traded for a bearer token.
 *
 * ## Credentials are the PLATFORM's, not the tenant's
 *
 * Gwinn owns one service account; every mirror spreadsheet is created and owned
 * by it, then *shared* with the merchant. So these live in env vars, which is
 * what server/tenantSecrets.ts documents as correct for platform credentials —
 * nothing a merchant pastes in ever reaches this module.
 *
 * That ownership split is also the security model for the mirror: the merchant
 * is a viewer on a file they do not own, so they cannot revoke Gwinn's access,
 * cannot edit the read-only tabs (Drive enforces it, not our code), and cannot
 * take the file with them in a way that makes the sync silently stop working.
 *
 * ## Unconfigured is a supported state
 *
 * Both env vars are optional. Self-hosted installs (SELF_HOSTING.md) and dev
 * boxes will not have them, and the whole feature must be *absent* there rather
 * than broken: `isSheetsConfigured()` gates every caller, and nothing in this
 * module is invoked when it returns false.
 *
 * Env:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL = …@….iam.gserviceaccount.com
 *   GOOGLE_SERVICE_ACCOUNT_KEY   = the PKCS#8 PEM private key from the JSON
 *                                  key file's `private_key` field. Literal
 *                                  "\n" escapes are tolerated, because that is
 *                                  how the value survives most secret stores.
 */

import { SignJWT, importPKCS8 } from "jose";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";

/**
 * `spreadsheets` to read/write cell values and structure; `drive.file` to share
 * the file we created. `drive.file` is deliberately the narrow scope — it grants
 * access only to files this service account created, so a compromised key
 * cannot reach anything else in any Drive.
 */
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
];

/** Refresh this long before the hour is up, so no request races the expiry. */
const TOKEN_SKEW_MS = 60_000;

export class SheetsError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "SheetsError";
    this.status = status;
  }
}

function serviceAccountEmail(): string {
  return (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "").trim();
}

/**
 * The PEM, with escaped newlines restored. Secret stores and .env files both
 * tend to flatten a multi-line PEM to one line with literal backslash-n; a key
 * in that shape parses as garbage, and the resulting error ("Invalid keyData")
 * says nothing about the cause.
 */
function serviceAccountKey(): string {
  return (process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? "")
    .trim()
    .replace(/\\n/g, "\n");
}

export function isSheetsConfigured(): boolean {
  return Boolean(serviceAccountEmail() && serviceAccountKey());
}

let cachedToken: { value: string; expiresAt: number } | null = null;

/**
 * Test-only: drop the memoised bearer token. Exported because the cache is
 * module-level state that would otherwise leak between test cases.
 */
export function resetSheetsAuthCache(): void {
  cachedToken = null;
}

/**
 * Trade a self-signed JWT for a bearer token (RFC 7523 §2.1). Memoised for the
 * token's lifetime: the mirror sweep touches every connected store in one run,
 * and a token request per store would be both slow and pointlessly rate-limited.
 */
export async function getAccessToken(): Promise<string> {
  if (!isSheetsConfigured()) {
    throw new SheetsError("Google Sheets credentials are not configured", 503);
  }
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - TOKEN_SKEW_MS > now) {
    return cachedToken.value;
  }

  const key = await importPKCS8(serviceAccountKey(), "RS256");
  const issuedAt = Math.floor(now / 1000);
  const assertion = await new SignJWT({ scope: SCOPES.join(" ") })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(serviceAccountEmail())
    .setAudience(TOKEN_URL)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + 3600)
    .sign(key);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new SheetsError(
      `Google token exchange failed: ${res.status} ${body.slice(0, 200)}`,
      res.status,
    );
  }
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!json.access_token) {
    throw new SheetsError("Google token exchange returned no token", 502);
  }
  cachedToken = {
    value: json.access_token,
    expiresAt: now + (json.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

async function call<T>(
  url: string,
  init: { method: string; body?: unknown } = { method: "GET" },
): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(url, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new SheetsError(
      `Google API ${init.method} ${url.split("?")[0]} failed: ${res.status} ${body.slice(0, 300)}`,
      res.status,
    );
  }
  // 204 on some Drive calls.
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

/**
 * Quote a sheet title for an A1 reference. Titles with spaces ("Stock In") are
 * a syntax error unquoted, and a single quote inside a title is escaped by
 * doubling — a merchant-renameable tab would otherwise be an injection point
 * into every range we build.
 */
export function a1(sheetTitle: string, range: string): string {
  return `'${sheetTitle.replace(/'/g, "''")}'!${range}`;
}

export interface CreatedSpreadsheet {
  spreadsheetId: string;
  spreadsheetUrl: string;
  /** Tab title → numeric sheetId, needed by every batchUpdate request. */
  sheetIds: Record<string, number>;
}

export async function createSpreadsheet(
  title: string,
  tabTitles: string[],
): Promise<CreatedSpreadsheet> {
  const json = await call<{
    spreadsheetId: string;
    spreadsheetUrl: string;
    sheets?: { properties?: { title?: string; sheetId?: number } }[];
  }>(SHEETS_API, {
    method: "POST",
    body: {
      properties: { title },
      sheets: tabTitles.map((t, index) => ({
        properties: { title: t, index },
      })),
    },
  });
  const sheetIds: Record<string, number> = {};
  for (const sheet of json.sheets ?? []) {
    const name = sheet.properties?.title;
    const id = sheet.properties?.sheetId;
    if (name && typeof id === "number") sheetIds[name] = id;
  }
  return {
    spreadsheetId: json.spreadsheetId,
    spreadsheetUrl:
      json.spreadsheetUrl ??
      `https://docs.google.com/spreadsheets/d/${json.spreadsheetId}/edit`,
    sheetIds,
  };
}

export interface SpreadsheetMeta {
  /** Tab title → numeric sheetId, needed by every batchUpdate request. */
  sheetIds: Record<string, number>;
  /**
   * Ids of the protections already in place. Re-applying protection without
   * removing these stacks a fresh duplicate on every call, and Sheets caps how
   * many a file may hold — so the caller deletes what it finds before adding.
   */
  protectedRangeIds: number[];
}

/** Structure of an existing spreadsheet, in one round trip. */
export async function getSpreadsheetMeta(
  spreadsheetId: string,
): Promise<SpreadsheetMeta> {
  const json = await call<{
    sheets?: {
      properties?: { title?: string; sheetId?: number };
      protectedRanges?: { protectedRangeId?: number }[];
    }[];
  }>(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties,sheets.protectedRanges.protectedRangeId`,
  );
  const sheetIds: Record<string, number> = {};
  const protectedRangeIds: number[] = [];
  for (const sheet of json.sheets ?? []) {
    const name = sheet.properties?.title;
    const id = sheet.properties?.sheetId;
    if (name && typeof id === "number") sheetIds[name] = id;
    for (const p of sheet.protectedRanges ?? []) {
      if (typeof p.protectedRangeId === "number") {
        protectedRangeIds.push(p.protectedRangeId);
      }
    }
  }
  return { sheetIds, protectedRangeIds };
}

export async function readValues(
  spreadsheetId: string,
  range: string,
): Promise<string[][]> {
  const json = await call<{ values?: string[][] }>(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}` +
      // Unformatted, so a price cell reads back as "19.9" rather than as
      // whatever the merchant's locale renders ("CHF 19.90", "19,90").
      `?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
  );
  return json.values ?? [];
}

export interface ValueRange {
  range: string;
  values: (string | number)[][];
}

/**
 * Replace the contents of one or more ranges in a single request.
 *
 * Ordering matters and is the caller's responsibility: a mirror refresh must
 * CLEAR before it writes, because writing 8 rows over a range that held 40
 * leaves 32 rows of last week's sales below the new ones, looking current.
 */
export async function clearRanges(
  spreadsheetId: string,
  ranges: string[],
): Promise<void> {
  if (ranges.length === 0) return;
  await call(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values:batchClear`,
    { method: "POST", body: { ranges } },
  );
}

export async function writeValues(
  spreadsheetId: string,
  data: ValueRange[],
): Promise<void> {
  if (data.length === 0) return;
  await call(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`,
    {
      method: "POST",
      body: {
        // RAW, not USER_ENTERED: USER_ENTERED runs the value through Sheets'
        // parser, which is how a SKU like "SEPT1" becomes a date and how a
        // leading "+" or "=" becomes a formula. The mirror publishes data, so
        // every cell must land as the literal we sent.
        valueInputOption: "RAW",
        data: data.map((d) => ({ range: d.range, values: d.values })),
      },
    },
  );
}

/** Structural changes: protected ranges, formatting, freezing header rows. */
export async function batchUpdateSpreadsheet(
  spreadsheetId: string,
  requests: unknown[],
): Promise<void> {
  if (requests.length === 0) return;
  await call(`${SHEETS_API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
    method: "POST",
    body: { requests },
  });
}

/**
 * Share the file with a merchant.
 *
 * `reader` for the mirror. Lane 2 needs the merchant to type into one tab, and
 * Drive has no per-tab permission — so a writer grant is paired with protected
 * ranges over every tab except Stock In (see server/sheetMirror.ts). The
 * protection is what makes a writer grant safe; do not hand out `writer`
 * without it.
 */
export async function shareSpreadsheet(
  spreadsheetId: string,
  email: string,
  role: "reader" | "writer",
): Promise<void> {
  await call(
    `${DRIVE_API}/${encodeURIComponent(spreadsheetId)}/permissions?sendNotificationEmail=true`,
    {
      method: "POST",
      body: { type: "user", role, emailAddress: email },
    },
  );
}

/**
 * Withdraw one person's access to the spreadsheet, leaving the file itself
 * alone.
 *
 * This is what a disconnect does, and it is deliberately NOT a delete. Gwinn
 * owns the file, so deleting would destroy a merchant's sales history on their
 * behalf over a single button press — irreversible, and not the kind of thing a
 * platform should do to data a merchant thinks of as theirs. Revoking the share
 * stops the exposure; the rows survive, so support can hand access back and a
 * reconnect has something to point at.
 *
 * Drive has no "unshare this address" call, only "delete this permission id", so
 * the id has to be looked up first. A missing permission is success, not an
 * error: it means the merchant already removed it from their own side, which is
 * exactly the state we were trying to reach.
 */
export async function unshareSpreadsheet(
  spreadsheetId: string,
  email: string,
): Promise<void> {
  const { permissions } = await call<{
    permissions?: { id?: string; emailAddress?: string }[];
  }>(
    `${DRIVE_API}/${encodeURIComponent(spreadsheetId)}/permissions` +
      `?fields=permissions(id,emailAddress)`,
  );

  const target = email.trim().toLowerCase();
  const match = (permissions ?? []).find(
    (p) => p.emailAddress?.trim().toLowerCase() === target,
  );
  if (!match?.id) return;

  await call(
    `${DRIVE_API}/${encodeURIComponent(spreadsheetId)}/permissions/${encodeURIComponent(match.id)}`,
    { method: "DELETE" },
  );
}
