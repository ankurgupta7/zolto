/**
 * Screenshot entry for the bulk upload page (client/src/pages/BulkUpload.tsx).
 *
 * Analysis is now several paced requests rather than one call — the provider's
 * per-minute token budget means a large batch legitimately takes minutes — so
 * the waiting panel gained a chunk counter. That panel only appears mid-run,
 * behind a file picker and a button, which SHOT_CLICK alone cannot reach: the
 * entry seeds photos through the page's own change handler and stubs
 * `products.bulkAnalyze` so the request never settles, pinning the page in the
 * state we need to look at.
 *
 *   npx vite --config tools/screenshot/vite.config.ts &
 *   SHOT_URL="http://localhost:5199/bulk.html?photos=9" \
 *     SHOT_CLICK="Analyse with AI" node tools/screenshot/shoot.mjs out/
 *
 * `?photos=N` sets how many photos are seeded, which is what decides how many
 * chunks the run is split into and therefore what the counter reads.
 */

import { createRoot } from "react-dom/client";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import "./entry.css";
import { trpc } from "@/lib/trpc";
import i18n from "@/lib/i18n";
import BulkUpload from "@/pages/BulkUpload";

const params = new URLSearchParams(location.search);
const PHOTO_COUNT = Number(params.get("photos") ?? 9);
// `?group=7` also walks the page to step 2 and groups the first 7 photos, so a
// shot can show a group above the 5-image analysis limit — the only state in
// which the "AI reads the first 5" hint appears.
const GROUP_SIZE = Number(params.get("group") ?? 0);

const RESPONSES: Record<string, unknown> = {
  "auth.me": {
    id: 1,
    name: "Anna Brunner",
    email: "anna@bergblume.ch",
    role: "admin",
    loginMethod: "google",
    tenantId: 42,
  },
  "tenant.me": {
    id: 42,
    slug: "bergblume",
    name: "Bergblume Keramik",
    plan: "free",
    subscriptionStatus: "trialing",
    terminalLocationId: null,
  },
  "tenant.getSettings": {
    contactEmail: "hello@bergblume.ch",
    currency: "chf",
    vertical: "jewellery",
    verticalDescription: null,
  },
  "categories.list": ["Rings", "Earrings", "Necklaces", "Other"].map(
    (key, i) => ({
      key,
      labelEn: key,
      labelDe: null,
      extraIncludes: [],
      sortOrder: i,
    }),
  ),
  "products.adminList": [],
};

// The analyse mutation never settles, so the page stays on the waiting panel
// for as long as the shot needs. Everything else answers normally.
const NEVER = new Promise<Response>(() => {});

window.fetch = ((input: RequestInfo | URL) => {
  const url = new URL(String(input), location.origin);
  const paths = url.pathname.replace(/^\/api\/trpc\//, "").split(",");
  if (paths.some((p) => p.includes("bulkAnalyze"))) return NEVER;
  const body = paths.map((p) => ({
    result: { data: superjson.serialize(RESPONSES[p] ?? null) },
  }));
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}) as typeof fetch;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
  },
});

const trpcClient = trpc.createClient({
  links: [httpBatchLink({ url: "/api/trpc", transformer: superjson })],
});

const { hook } = memoryLocation({ path: "/admin/bulk", static: true });

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <Router hook={hook}>
        <BulkUpload />
      </Router>
    </QueryClientProvider>
  </trpc.Provider>,
);

/**
 * A tiny JPEG per photo, handed to the page's own file-picker handler. The
 * sandbox has no camera and no network, and the page reads each file with a
 * FileReader — so a real File carrying real bytes is the only way in.
 */
function seedPhotos(count: number): boolean {
  const canvas = document.createElement("canvas");
  canvas.width = 240;
  canvas.height = 240;

  const files: File[] = [];
  for (let i = 0; i < count; i++) {
    const ctx = canvas.getContext("2d")!;
    const hue = (i * 47) % 360;
    ctx.fillStyle = `hsl(${hue} 24% 82%)`;
    ctx.fillRect(0, 0, 240, 240);
    ctx.fillStyle = `hsl(${hue} 30% 62%)`;
    ctx.beginPath();
    ctx.arc(120, 120, 70, 0, Math.PI * 2);
    ctx.fill();

    const base64 = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    files.push(new File([bytes], `piece-${i + 1}.jpg`, { type: "image/jpeg" }));
  }

  const input = document.querySelector<HTMLInputElement>(
    'input[type="file"][multiple]',
  );
  if (!input) return false;

  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  Object.defineProperty(input, "files", { value: dt.files, writable: false });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

// React commits asynchronously, so the file input does not exist on the first
// frame — poll for it rather than guessing a number of frames. shoot.mjs waits
// on the network and on fonts before it clicks, by which time the thumbnails
// and the analyse button are up.
const seedStarted = Date.now();
const seed = () => {
  if (seedPhotos(PHOTO_COUNT)) {
    if (GROUP_SIZE > 1) {
      // Surface a failure as a page error rather than an unhandled rejection —
      // shoot.mjs reports page errors, and a silently half-driven page would
      // produce a screenshot of the wrong state.
      groupFirstPhotos(GROUP_SIZE).catch(reportDriveFailure);
    }
    return;
  }
  if (Date.now() - seedStarted > 5000) {
    throw new Error("bulk.tsx: file input never appeared");
  }
  requestAnimationFrame(seed);
};
requestAnimationFrame(seed);

/**
 * A driver that fails leaves the page on an earlier step, which photographs
 * perfectly well and looks like a real state — the trap this entry has already
 * fallen into once, when its English labels didn't match a German page. Paint
 * the failure over the page so any shot taken afterwards is unmistakable, and
 * re-throw so it lands in shoot.mjs's page-error list too.
 */
function reportDriveFailure(err: unknown) {
  const banner = document.createElement("div");
  banner.style.cssText =
    "position:fixed;inset:0 0 auto 0;z-index:99999;background:#b00020;color:#fff;" +
    "font:16px/1.4 monospace;padding:16px;white-space:pre-wrap";
  banner.textContent = `SCREENSHOT DRIVER FAILED — this page is NOT the state you asked for\n${String(err)}`;
  document.body.prepend(banner);
  setTimeout(() => {
    throw err;
  });
}

/**
 * Poll until an element whose visible text is `text` exists, then return it.
 * The budget is short on purpose: React commits in milliseconds, so anything
 * slower is a mismatch, and a long wait would let the shot be taken before the
 * failure surfaced.
 */
function waitForClickable(text: string): Promise<HTMLElement> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const match = [
        ...document.querySelectorAll<HTMLElement>("button, [role=button]"),
      ].find((el) => (el.textContent ?? "").trim().includes(text));
      if (match) return resolve(match);
      if (Date.now() - started > 2000) {
        return reject(new Error(`bulk.tsx: no control matching "${text}"`));
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

/**
 * Walk the real UI to step 2 and group the first `size` photos, clicking the
 * same controls a merchant would. shoot.mjs's SHOT_CLICK cannot do this part:
 * a photo tile's accessible name carries its "Solo" badge as well as its
 * filename, so the exact-match lookup it uses never resolves one.
 */
async function groupFirstPhotos(size: number) {
  // Resolve the labels through the app's own i18n rather than hard-coding
  // English. SHOT_LANG switches the page's language, and a driver that only
  // knows English silently leaves the page on step 1 — producing a screenshot
  // of the wrong state with nothing to say it went wrong.
  const label = (key: string, vars?: Record<string, unknown>) =>
    i18n.t(`bulkUpload.${key}`, vars) as string;

  (await waitForClickable(label("nextGroup"))).click();
  (await waitForClickable(label("groupMode"))).click();

  // Yield between clicks. A tile's onClick closes over `groupingMode` from the
  // render that attached it, so clicking tiles in the same tick as the mode
  // toggle hits handlers that still see grouping off and do nothing at all.
  await nextFrame();

  for (let i = 1; i <= size; i++) {
    const tile = document
      .querySelector<HTMLImageElement>(`img[alt="piece-${i}.jpg"]`)
      ?.closest("button");
    if (!tile) throw new Error(`bulk.tsx: photo tile ${i} not found`);
    tile.click();
    await nextFrame();
  }

  (await waitForClickable(label("createGroup", { count: size }))).click();
}

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
