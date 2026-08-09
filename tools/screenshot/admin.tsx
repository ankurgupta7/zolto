/**
 * Screenshot entry for tenant admin pages.
 *
 * Same approach as platform.tsx: mount the REAL pages inside the REAL
 * AdminLayout behind the REAL trpc client, and stub only the transport, so
 * what is captured is what ships. `?route=` picks the page, and `?plan=pro`
 * puts the stub store on the paid plan — the only way to see a plan-gated page
 * (Domain) in its real state rather than behind its upsell.
 *
 *   npx vite --config tools/screenshot/vite.config.ts &
 *   SHOT_URL="http://localhost:5199/admin.html?route=/admin/account" \
 *     node tools/screenshot/shoot.mjs out/
 */

import { createRoot } from "react-dom/client";
import { Route, Router, Switch } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import "./entry.css";
import { trpc } from "@/lib/trpc";
import AdminLayout from "@/components/admin/AdminLayout";
import { ADMIN_NAV } from "@/admin/nav";
import ShopProfile from "@/pages/admin/ShopProfile";
import MyAccount from "@/pages/admin/MyAccount";
import Pos from "@/pages/admin/Pos";
import Channels from "@/pages/admin/Channels";
import Keys from "@/pages/admin/Keys";
import Categories from "@/pages/admin/Categories";
import CsvImport from "@/pages/CsvImport";
import Domain from "@/pages/admin/Domain";
import Billing from "@/pages/Billing";

const params = new URLSearchParams(location.search);
const route = params.get("route") ?? "/admin/account";
const plan = params.get("plan") ?? "free";
// `?comp=pro` puts the stub store on the house — the state the operator's
// "On the house" grant leaves a merchant in, and the only way to see the
// Billing page's comp banner rather than its upsell.
const comp = params.get("comp");

const RESPONSES: Record<string, unknown> = {
  "auth.me": {
    id: 1,
    name: "Anna Brunner",
    email: "anna@bergblume.ch",
    role: "admin",
    loginMethod: "google",
    tenantId: 42,
  },
  // `plan` here is the ENTITLED plan, exactly as tenant.me returns it — so
  // `?comp=pro` lifts the plan gates on this stub store the same way a real
  // comp does, and the Domain page renders its form rather than its upsell.
  "tenant.me": {
    id: 42,
    slug: "bergblume",
    name: "Bergblume Keramik",
    plan: comp === "pro" ? "pro" : plan,
    paidPlan: plan,
    compPlan: comp === "pro" ? "pro" : null,
    planComped: comp === "pro",
    feeWaived: Boolean(comp),
    comped: Boolean(comp),
    onlineFeeBps: comp || plan === "pro" ? 0 : 100,
    subscriptionStatus: comp ? null : "trialing",
    terminalLocationId: null,
  },
  // Domain page: a saved custom domain whose CNAME hasn't landed yet — the
  // state a merchant actually sits in while waiting for DNS.
  "tenant.domainStatus": {
    domain: "shop.bergblume.ch",
    expected: "app.zolto.ch",
    pointsToUs: false,
  },
  "tenant.getSettings": {
    contactEmail: "hello@bergblume.ch",
    contactPhone: "+41 79 000 00 00",
    currency: "chf",
    publicDomain: "shop.bergblume.ch",
    twintQrUrl: null,
    vertical: "ceramics",
    verticalDescription: "Wheel-thrown stoneware in muted glazes",
  },
  // Bergblume is a ceramics studio — its own category list, not jewellery.
  "categories.list": [
    "Mugs & Cups",
    "Bowls",
    "Plates & Platters",
    "Vases",
    "Sculpture & Objects",
    "Other",
  ].map((key, i) => ({
    key,
    labelEn: key,
    labelDe:
      {
        "Mugs & Cups": "Tassen & Becher",
        Bowls: "Schalen",
        Vases: "Vasen",
        Other: "Sonstiges",
      }[key] ?? null,
    extraIncludes: [],
    sortOrder: i,
  })),
  "tenant.getStripeConnectUrl": {
    url: "https://connect.stripe.com/…",
    connected: true,
  },
  // Mutation response so the Keys page's post-rotation state (one-time key +
  // scan-to-pair QR) can be captured by clicking through in the shot.
  "tenant.rotatePosApiKey": {
    posApiKey: "pos_live_c1a9f2e84b7d4d21b6f0e5a83912cdEXAMPLE",
  },
  // POS page: the rolling `pos-latest` release CI publishes on every merge to
  // main, as server/posDownloads.ts resolves it — so the shot shows real links
  // with their build stamp, and the iOS sideload warning that goes with an
  // unsigned IPA. `?pos=unpublished` shows the no-build-yet state instead.
  "tenant.posDownloads":
    params.get("pos") === "unpublished"
      ? { android: null, ios: null }
      : {
          android: {
            url: "https://github.com/ankurgupta7/zolto/releases/download/pos-latest/ZoltoPOS-latest.apk",
            requiresSideload: false,
            sizeBytes: 9_240_000,
            builtAt: "2026-08-09T09:12:00Z",
            commit: "3f2a1bc",
          },
          ios: {
            url: "https://github.com/ankurgupta7/zolto/releases/download/pos-latest/ZoltoPOS-latest-unsigned.ipa",
            requiresSideload: true,
            sizeBytes: 21_400_000,
            builtAt: "2026-08-09T09:20:00Z",
            commit: "3f2a1bc",
          },
        },
  // Keys page: `?pairing=rotate` shows the "rotate once to enable" state a
  // store lands in when its key predates the vault copy.
  "tenant.posPairingAvailable": {
    available: params.get("pairing") !== "rotate",
  },
  // Mutation response so the minted-link state (deep link + web link + QR +
  // expiry) can be captured by clicking "Generate a pairing link".
  "tenant.createPosPairingToken": {
    available: true,
    deepLink:
      "zolto://pair?t=Q2xhdWRlRXhhbXBsZVBhaXJpbmdUb2tlbg&url=https%3A%2F%2Fbergblume.zolto.ch",
    webLink:
      "https://bergblume.zolto.ch/pos/pair?t=Q2xhdWRlRXhhbXBsZVBhaXJpbmdUb2tlbg",
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  },
  "tenant.channelConnect": {
    slackAuthorizeUrl: "https://slack.com/oauth/v2/authorize?client_id=stub",
    discordInviteUrl: "https://discord.com/oauth2/authorize?client_id=stub",
  },
  "tenant.channelSecrets": {
    vaultConfigured: true,
    secrets: [
      {
        provider: "discord_bot_token",
        hint: "3f9a",
        rotatedAt: new Date("2026-07-20T00:00:00Z"),
      },
    ],
  },
  "billing.getStatus": {
    plan: comp === "pro" ? "pro" : plan,
    comp:
      comp === "pro"
        ? { plan: "pro", planComped: true, feeWaived: true }
        : comp === "fee"
          ? { plan: null, planComped: false, feeWaived: true }
          : null,
    subscriptionStatus: comp ? null : "trialing",
    trialEndsAt: null,
    ai:
      comp === "pro" || plan === "pro"
        ? { allowancePerMonth: null, usedThisMonth: null }
        : { allowancePerMonth: 5, usedThisMonth: 2 },
    onlineFees: {
      feePercentLabel: "1%",
      appliesTo: "online and AI-agent orders",
      feeBps: comp || plan === "pro" ? 0 : 100,
      monthGmvChf: 3200,
      monthAgentGmvChf: 500,
      monthOrderCount: 12,
      monthFeeChf: comp || plan === "pro" ? 0 : 32,
    },
    upsell:
      comp || plan === "pro"
        ? null
        : { breakEvenOnlineChf: 2500, proPriceChf: 25, savingsChf: 7 },
    plans: [
      {
        id: "free",
        name: "Free",
        priceChf: 0,
        onlineFeeBps: 100,
        aiPhotoAllowancePerMonth: 5,
        maxProducts: 200,
        storageGb: 5,
      },
      {
        id: "pro",
        name: "Pro",
        priceChf: 25,
        onlineFeeBps: 0,
        aiPhotoAllowancePerMonth: null,
        maxProducts: 5000,
        storageGb: 50,
      },
    ],
    storage: { usedBytes: 1024 ** 3, limitBytes: 5 * 1024 ** 3 },
    billingConfigured: true,
  },
  "billing.photoCreditHistory": [],
  "staff.list": {
    staff: [
      {
        id: 1,
        name: "Anna Brunner",
        email: "anna@bergblume.ch",
        role: "admin",
      },
    ],
    pendingInvites: [],
    seatsUsed: 1,
    seatLimit: comp === "pro" || plan === "pro" ? 3 : 1,
  },
  "instagram.adminList": [],
  // Import page: provider migration cards + existing-product matching.
  "migration.status": {
    stripe: { connected: true, connectAvailable: true },
    csvProviders: ["sumup", "worldline", "generic"],
  },
  "products.adminList": [],
};

window.fetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input), location.origin);
  const paths = url.pathname.replace(/^\/api\/trpc\//, "").split(",");
  const body = paths.map((p) => ({
    result: { data: superjson.serialize(RESPONSES[p] ?? null) },
  }));
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

const PAGES: Record<string, React.ComponentType> = {
  categories: Categories,
  import: CsvImport,
  account: ShopProfile,
  me: MyAccount,
  pos: Pos,
  channels: Channels,
  keys: Keys,
  domain: Domain,
};

// Billing lives outside ADMIN_NAV (it is reached from the account menu), so it
// gets its own route rather than a nav entry.
const BILLING_PATH = "/admin/billing";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
  },
});

const trpcClient = trpc.createClient({
  links: [httpBatchLink({ url: "/api/trpc", transformer: superjson })],
});

const { hook } = memoryLocation({ path: route, static: true });

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <Router hook={hook}>
        <Switch>
          <Route path={BILLING_PATH}>
            <Billing />
          </Route>
          {ADMIN_NAV.filter((i) => PAGES[i.id]).map((item) => {
            const Page = PAGES[item.id];
            return (
              <Route key={item.id} path={item.path}>
                <AdminLayout title={item.label}>
                  <Page />
                </AdminLayout>
              </Route>
            );
          })}
        </Switch>
      </Router>
    </QueryClientProvider>
  </trpc.Provider>,
);
