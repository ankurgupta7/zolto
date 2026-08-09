/**
 * Where a merchant gets the register app.
 *
 * The admin used to read store links from build-time env (VITE_POS_ANDROID_URL /
 * VITE_POS_IOS_URL), which nothing ever set — so every tenant saw "not published
 * yet" and the download step was a dead end. The apps are built by CI on every
 * merge to main and published to a rolling GitHub Release (tag `pos-latest`,
 * see .github/actions/pos-release-upload). The repo is public, so those assets
 * download with no auth, and the asset names are fixed — which is what makes a
 * link we can hand every tenant possible at all.
 *
 * This module resolves those links and, where it can, stamps them with which
 * build they are ("built 9 Aug, 3f2a1bc") so support can tell what a merchant is
 * running.
 *
 * Two rules shape the error handling:
 *
 *   - It NEVER throws. /admin/pos must render during a GitHub outage.
 *   - It distinguishes "not published" from "couldn't ask". When GitHub answers
 *     and the asset genuinely isn't there, the platform returns null and the UI
 *     says so plainly rather than rendering a button that 404s. When GitHub
 *     can't be reached, the URL is returned unadorned — hiding a working
 *     download because an API call was rate-limited would be worse.
 */

/** One platform's build, as offered to a merchant. */
export interface PosDownload {
  url: string;
  /**
   * True when the file cannot simply be tapped to install. The iOS build from
   * GitHub Actions is UNSIGNED: it needs re-signing with AltStore/Sideloadly
   * from a computer first. The UI must say this rather than implying an App
   * Store install — a merchant who taps it expecting an install just gets a
   * file they can't open.
   */
  requiresSideload: boolean;
  sizeBytes?: number;
  /** ISO timestamp the asset was last replaced by CI. */
  builtAt?: string;
  /** Short commit SHA the build came from, via the sidecar JSON asset. */
  commit?: string;
}

export interface PosDownloads {
  android: PosDownload | null;
  ios: PosDownload | null;
}

const DEFAULT_REPO = "ankurgupta7/zolto";
const DEFAULT_TAG = "pos-latest";
const ANDROID_ASSET = "ZoltoPOS-latest.apk";
const IOS_ASSET = "ZoltoPOS-latest-unsigned.ipa";
const ANDROID_SIDECAR = "android-build.json";
const IOS_SIDECAR = "ios-build.json";

const CACHE_TTL_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5_000;

/** `owner/repo` — guards against an env typo becoming a bogus URL. */
const REPO_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

export function releaseRepo(): string {
  const configured = (process.env.POS_RELEASE_REPO ?? "").trim();
  if (configured && REPO_RE.test(configured)) return configured;
  if (configured) {
    console.warn(
      `[posDownloads] POS_RELEASE_REPO=${JSON.stringify(configured)} is not "owner/repo" — falling back to ${DEFAULT_REPO}`,
    );
  }
  return DEFAULT_REPO;
}

export function releaseTag(): string {
  return (process.env.POS_RELEASE_TAG ?? "").trim() || DEFAULT_TAG;
}

function assetUrl(asset: string): string {
  return `https://github.com/${releaseRepo()}/releases/download/${releaseTag()}/${asset}`;
}

/**
 * A `.ipa` always needs sideloading; anything else an operator points us at
 * (a TestFlight invite, a Play Store listing) is assumed installable. Inferring
 * from the extension keeps self-hosters from needing yet another env var to
 * describe what their own link is.
 */
function inferRequiresSideload(url: string): boolean {
  return /\.ipa(\?|#|$)/i.test(url);
}

// ─── GitHub release metadata ──────────────────────────────────────────────────

interface ReleaseAsset {
  name: string;
  size: number;
  updated_at: string;
  browser_download_url: string;
}

/** What a successful metadata lookup produced. Null `assets` = lookup failed. */
interface ReleaseMeta {
  assets: Map<string, ReleaseAsset> | null;
  commits: Map<string, string>;
}

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "zolto-pos-downloads",
  };
  // Unauthenticated GitHub API allows 60 requests/hour/IP. Caching keeps us far
  // under that, but a token (when the deployment has one) removes the risk.
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: githubHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchReleaseMeta(): Promise<ReleaseMeta> {
  const repo = releaseRepo();
  const tag = releaseTag();
  const body = await fetchJson(
    `https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`,
  );

  if (!body || typeof body !== "object" || !Array.isArray((body as { assets?: unknown }).assets)) {
    // Includes the 404 before the very first publish. Indistinguishable from a
    // transient failure at this layer, so treat it as "couldn't ask" and let
    // the caller fall back to bare URLs.
    return { assets: null, commits: new Map() };
  }

  const assets = new Map<string, ReleaseAsset>();
  for (const raw of (body as { assets: unknown[] }).assets) {
    if (!raw || typeof raw !== "object") continue;
    const a = raw as Partial<ReleaseAsset>;
    if (typeof a.name !== "string") continue;
    assets.set(a.name, {
      name: a.name,
      size: typeof a.size === "number" ? a.size : 0,
      updated_at: typeof a.updated_at === "string" ? a.updated_at : "",
      browser_download_url:
        typeof a.browser_download_url === "string"
          ? a.browser_download_url
          : assetUrl(a.name),
    });
  }

  // Provenance comes from the per-platform sidecar JSON rather than the release
  // body, because Android and iOS publish concurrently and must not race over
  // shared text. Best-effort: a missing sidecar just means no commit stamp.
  const commits = new Map<string, string>();
  await Promise.all(
    [ANDROID_SIDECAR, IOS_SIDECAR].map(async (name) => {
      const asset = assets.get(name);
      if (!asset) return;
      const sidecar = await fetchJson(asset.browser_download_url);
      const commit = (sidecar as { commit?: unknown } | null)?.commit;
      if (typeof commit === "string" && commit.length > 0) {
        commits.set(name, commit.slice(0, 7));
      }
    }),
  );

  return { assets, commits };
}

// ─── Cache ────────────────────────────────────────────────────────────────────

let cache: { at: number; value: PosDownloads } | null = null;

/** Test seam — resets the in-process cache. */
export function clearPosDownloadsCache(): void {
  cache = null;
}

function resolveOne(
  envUrl: string | undefined,
  assetName: string,
  sidecarName: string,
  meta: ReleaseMeta,
): PosDownload | null {
  // An operator override is taken at face value: it may point anywhere
  // (TestFlight, an internal MDM host) and carries no GitHub metadata.
  const override = envUrl?.trim();
  if (override) {
    return { url: override, requiresSideload: inferRequiresSideload(override) };
  }

  const url = assetUrl(assetName);
  const requiresSideload = inferRequiresSideload(url);

  if (meta.assets === null) {
    // Couldn't ask GitHub — offer the link anyway, without a build stamp.
    return { url, requiresSideload };
  }

  const asset = meta.assets.get(assetName);
  // GitHub answered and the asset isn't there: genuinely not published yet.
  if (!asset) return null;

  return {
    url: asset.browser_download_url,
    requiresSideload,
    sizeBytes: asset.size > 0 ? asset.size : undefined,
    builtAt: asset.updated_at || undefined,
    commit: meta.commits.get(sidecarName),
  };
}

/**
 * Resolve both platforms' download links. Cached in-process for 15 minutes;
 * every failure degrades rather than throwing.
 */
export async function getPosDownloads(): Promise<PosDownloads> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.value;

  const androidEnv = process.env.POS_ANDROID_URL;
  const iosEnv = process.env.POS_IOS_URL;

  // Skip the network entirely when both platforms are overridden.
  const meta: ReleaseMeta =
    androidEnv?.trim() && iosEnv?.trim()
      ? { assets: null, commits: new Map() }
      : await fetchReleaseMeta();

  const value: PosDownloads = {
    android: resolveOne(androidEnv, ANDROID_ASSET, ANDROID_SIDECAR, meta),
    ios: resolveOne(iosEnv, IOS_ASSET, IOS_SIDECAR, meta),
  };

  cache = { at: now, value };
  return value;
}
