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
import { SITE_IMPORT } from "@shared/platform";
import AdminLayout from "@/components/admin/AdminLayout";
import Navbar from "@/components/Navbar";
import { TenantProvider } from "@/contexts/TenantContext";
import { CartProvider } from "@/contexts/CartContext";
import { ADMIN_NAV } from "@/admin/nav";
import ShopProfile from "@/pages/admin/ShopProfile";
import MyAccount from "@/pages/admin/MyAccount";
import Pos from "@/pages/admin/Pos";
import Channels from "@/pages/admin/Channels";
import Keys from "@/pages/admin/Keys";
import Categories from "@/pages/admin/Categories";
import AdminImport from "@/pages/admin/Import";
import Domain from "@/pages/admin/Domain";
import Storefront from "@/pages/admin/Storefront";
import Insights from "@/pages/admin/Insights";
import Testimonials from "@/pages/admin/Testimonials";
import Discounts from "@/pages/admin/Discounts";
import Sales from "@/pages/admin/Sales";
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
  // The storefront Navbar renders above every admin route (App.tsx
  // StorefrontRouter), and it is `fixed`, so the admin shell has to clear it.
  // Shooting the shell without it hid that: the sidebar's first entries and the
  // page title were behind the bar in the real app and nowhere near it here.
  "tenant.getBySlug": {
    id: 42,
    slug: "bergblume",
    name: "Bergblume Keramik",
    plan: "free",
    whiteLabel: false,
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
    // A store that has written its own words, so the Storefront page's content
    // card is captured filled in rather than as four empty boxes — the state
    // that actually needs looking at.
    whiteLabelName: "Bergblume Keramik",
    logoUrl: null,
    primaryColor: "#3A5A40",
    secondaryColor: "#B08968",
    metaTitle: "Bergblume Keramik — handgetöpfertes Steinzeug",
    metaDescription:
      "Auf der Scheibe gedrehtes Steinzeug aus dem Atelier in Basel.",
    heroImageUrl: null,
    heroHeadline: "Von Hand gedreht, Stück für Stück",
    heroSubtitle:
      "Steinzeug aus dem Atelier — online bestellen oder bei uns vorbeikommen.",
    aboutBody:
      "Wir haben 2018 mit einem Brennofen und einem kleinen Tisch angefangen.\n\nHeute drehen wir jedes Stück von Hand in unserem Atelier in Basel.",
    companyLegalName: "Bergblume Keramik GmbH",
    companyAddress: "Musterstrasse 1\n4051 Basel\nSchweiz",
    vatNumber: "CHE-123.456.789 MWST",
    companyRegistration: "CH-270.3.001.234-5",
    trustpilotDomain: "bergblume.ch",
    trustpilotShowRating: true,
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
  // Insights page.
  "insights.summary": {
    currency: "CHF",
    catalog: { total: 118, live: 96, sold: 22, avgPrice: 64 },
    last30d: {
      onlineOrders: 9,
      onlineRevenue: 612,
      posSales: 23,
      posRevenue: 1480,
      totalRevenue: 2092,
      totalUnits: 32,
    },
    topSellers: [
      { name: "Stoneware mug — oat", units: 7, revenue: 294 },
      { name: "Serving bowl, large", units: 3, revenue: 360 },
    ],
    staleStock: [{ name: "Studio seconds box", daysLive: 112, price: 28 }],
  },
  // Agent traffic. `?agents=none` shows the empty state instead — a store no
  // AI has found yet, which is what most stores see on day one and the state
  // most likely to read as breakage if it were drawn as an empty chart.
  "insights.agentTraffic":
    params.get("agents") === "none"
      ? {
          days: 30,
          total: 0,
          assistantHits: 0,
          byDay: [],
          byAgent: [],
          bySurface: [],
          byTool: [],
        }
      : {
          days: 30,
          total: 148,
          assistantHits: 61,
          // A plausible month: quiet at first, then a crawler finds the shop.
          byDay: [
            2, 0, 1, 3, 2, 4, 1, 0, 2, 5, 3, 6, 4, 2, 7, 5, 9, 4, 6, 8, 3, 5,
            11, 7, 6, 9, 4, 8, 7, 5,
          ].map((count, i) => ({
            day: new Date(Date.now() - (29 - i) * 86_400_000)
              .toISOString()
              .slice(0, 10),
            count,
          })),
          byAgent: [
            { agent: "GPTBot", kind: "crawler", count: 54 },
            { agent: "ClaudeBot", kind: "crawler", count: 33 },
            { agent: "ChatGPT", kind: "assistant", count: 31 },
            { agent: "Claude", kind: "assistant", count: 22 },
            { agent: "PerplexityBot", kind: "crawler", count: 8 },
          ],
          bySurface: [
            { surface: "llms.txt", count: 87 },
            { surface: "mcp", count: 49 },
            { surface: "robots.txt", count: 12 },
          ],
          byTool: [
            { tool: "search_products", count: 28 },
            { tool: "get_product", count: 14 },
            { tool: "create_checkout", count: 5 },
            { tool: "get_store_info", count: 2 },
          ],
        },
  // Import page: provider migration cards + existing-product matching.
  "migration.status": {
    stripe: { connected: true, connectAvailable: true },
    csvProviders: ["sumup", "worldline", "generic"],
  },
  "products.adminList": [],
  // Import page: the paid one-time switch-in (shared/platform.ts SITE_IMPORT).
  "siteImport.status": {
    offer: SITE_IMPORT,
    checkoutAvailable: true,
    latest: null,
  },
  // Mutation response, so `SHOT_CLICK` on "See what we can bring over" captures
  // the state that actually matters: what was found, shown BEFORE the price.
  "siteImport.preview": {
    importId: 5,
    pagesRead: 34,
    priceChf: SITE_IMPORT.priceChf,
    productCount: 118,
    pricedCount: 112,
    withPhoto: 104,
    categories: ["Mugs & Cups", "Bowls", "Vases"],
    profile: {
      storeName: "Bergblume Keramik",
      about: "Wheel-thrown stoneware in muted glazes",
      email: "hello@bergblume.ch",
      logoUrl: "https://bergblume.ch/logo.png",
      primaryColor: "#4a5d4e",
    },
    warnings: [
      "6 of 118 products had no price we could read — you can fill those in before importing.",
      "14 products came without a photo.",
    ],
    has: {
      logo: true,
      brandColour: true,
      shopProfile: true,
      categories: true,
    },
    products: [
      { name: "Stoneware mug — oat", price: 42, currency: "CHF" },
      { name: "Stoneware mug — slate", price: 42, currency: "CHF" },
      { name: "Serving bowl, large", price: 120, currency: "CHF" },
      { name: "Bud vase", price: 38, currency: "CHF" },
      { name: "Studio seconds box", price: null },
    ],
  },
};

// Returning from Stripe: /admin/products/import?imported=5. The card reads the
// row's status, not the URL, so this is the only way to see the paid state.
// Reviews page: a connected Trustpilot profile with a live rating, and three
// published quotes — including one with no photo, which is the common case and
// the one whose initials-avatar fallback only a screenshot can judge.
RESPONSES["trustpilot.status"] = {
  ratingsAvailable: true,
  domain: "bergblume.ch",
  showRating: true,
  profileUrl: "https://ch.trustpilot.com/review/bergblume.ch",
  reviewUrl: "https://ch.trustpilot.com/evaluate/bergblume.ch",
  summary: {
    domain: "bergblume.ch",
    displayName: "Bergblume Keramik",
    stars: 4.5,
    trustScore: 4.6,
    numberOfReviews: 128,
    profileUrl: "https://ch.trustpilot.com/review/bergblume.ch",
  },
};

RESPONSES["testimonials.adminList"] = [
  {
    id: 1,
    authorName: "Anna Meier",
    authorTitle: "Basel",
    authorPhotoUrl: null,
    googleId: null,
    quote:
      "Die Schale kam wunderbar verpackt an und ist noch schöner als auf den Bildern.",
    rating: 5,
    source: "manual",
    published: true,
    sortOrder: 0,
  },
  {
    id: 2,
    authorName: "Beat Suter",
    authorTitle: "Zürich",
    authorPhotoUrl: null,
    googleId: "117482910324",
    quote:
      "Zweite Bestellung innert eines Monats. Die Glasuren sind einfach anders als alles, was man im Laden findet.",
    rating: 5,
    source: "google",
    published: true,
    sortOrder: 1,
  },
  {
    id: 3,
    authorName: "Céline Rochat",
    authorTitle: null,
    authorPhotoUrl: null,
    googleId: null,
    quote: "Schnell geliefert, sorgfältig gearbeitet. Gerne wieder.",
    rating: 4,
    source: "trustpilot",
    published: false,
    sortOrder: 2,
  },
];

// Discounts page: the three shapes a merchant actually runs — an open
// campaign code, a batch code partway through its limit, and a single-use
// friends-and-family code that has been switched off.
RESPONSES["discounts.list"] = [
  {
    id: 1,
    code: "WELCOME10",
    kind: "percent",
    value: 10,
    currency: null,
    campaign: "spring",
    minSubtotalRappen: null,
    maxRedemptions: null,
    redeemedCount: 42,
    startsAt: null,
    expiresAt: null,
    active: true,
    createdAt: "2026-06-01T00:00:00.000Z",
    description: "10% off",
  },
  {
    id: 2,
    code: "XMAS-7K3P9QME",
    kind: "amount",
    value: 1500,
    currency: "chf",
    campaign: "weihnachtsmarkt",
    minSubtotalRappen: 5000,
    maxRedemptions: 50,
    redeemedCount: 23,
    startsAt: null,
    expiresAt: "2026-12-24T00:00:00.000Z",
    active: true,
    createdAt: "2026-07-14T00:00:00.000Z",
    description: "CHF 15.00 off",
  },
  {
    id: 3,
    code: "FRIENDSFAMILY-M4TZ",
    kind: "percent",
    value: 25,
    currency: null,
    campaign: "friends-family",
    minSubtotalRappen: null,
    maxRedemptions: 1,
    redeemedCount: 1,
    startsAt: null,
    expiresAt: null,
    active: false,
    createdAt: "2026-08-02T00:00:00.000Z",
    description: "25% off",
  },
];

// Sales page: a day's takings as a merchant would actually see them — mostly
// in-person cash and TWINT with real piece names, one online order, and one
// legacy sale whose line items were never recorded (the "No items recorded"
// state, which is what this page had to be able to say honestly).
RESPONSES["sales.list"] = {
  rows: [
    {
      key: "pos-91",
      id: 91,
      channel: "pos",
      reference: "KPOS-91",
      createdAt: "2026-08-16T12:14:47.000Z",
      paymentMethod: "cash",
      currency: "chf",
      amountMinor: 15000,
      customerName: null,
      customerEmail: null,
      items: [
        { productId: 4, name: "Serving bowl, large", amountMinor: 12000 },
        { productId: 9, name: "Bud vase", amountMinor: 3000 },
      ],
    },
    {
      key: "pos-90",
      id: 90,
      channel: "pos",
      reference: "KPOS-90",
      createdAt: "2026-08-16T12:01:58.000Z",
      paymentMethod: "twint",
      currency: "chf",
      amountMinor: 18000,
      customerName: "Beat Suter",
      customerEmail: null,
      items: [
        { productId: 1, name: "Stoneware mug \u2014 oat", amountMinor: 4200 },
        { productId: 2, name: "Stoneware mug \u2014 slate", amountMinor: 4200 },
        { productId: 7, name: "Plate, dinner", amountMinor: 9600 },
      ],
    },
    {
      key: "online-33",
      id: 33,
      channel: "online",
      reference: "#33",
      createdAt: "2026-08-15T18:22:10.000Z",
      paymentMethod: "card",
      currency: "chf",
      amountMinor: 8000,
      customerName: "C\u00e9line Rochat",
      customerEmail: "celine@example.ch",
      items: [{ productId: 3, name: "Studio seconds box", amountMinor: 0 }],
    },
    {
      key: "pos-88",
      id: 88,
      channel: "pos",
      reference: "KPOS-88",
      createdAt: "2026-07-12T06:46:22.000Z",
      paymentMethod: "cash",
      currency: "chf",
      amountMinor: 17000,
      customerName: null,
      customerEmail: null,
      items: [],
    },
  ],
  totals: {
    count: 4,
    grossMinor: 58000,
    posCount: 3,
    posGrossMinor: 50000,
    onlineCount: 1,
    onlineGrossMinor: 8000,
  },
  paymentMethods: ["card", "cash", "twint"],
  truncated: false,
};

// Recovery report: what a real run looks like — some sales rebuildable, some
// nameable but not priceable, and cash that can never be recovered.
RESPONSES["sales.backfillLineItems"] = {
  scanned: 4,
  withStripePayment: 3,
  cashUnrecoverable: 1,
  restored: 2,
  lineItemsWritten: 3,
  invoiceNumbersFilled: 4,
  dryRun: true,
  skipped: [
    {
      posOrderId: 88,
      totalChf: "170.00",
      createdAt: "2026-07-12T06:46:22.000Z",
      names: ["Serving bowl, large", "Bud vase"],
      reason:
        "list prices total CHF 150.00 but the sale charged CHF 170.00 \u2014 probably bargained, so per-item prices can't be recovered",
    },
    {
      posOrderId: 84,
      totalChf: "42.00",
      createdAt: "2026-07-08T07:51:21.000Z",
      names: [],
      reason: "cash sale \u2014 never went through Stripe, nothing to read",
    },
  ],
};

RESPONSES["siteImport.get"] = {
  ...(RESPONSES["siteImport.preview"] as Record<string, unknown>),
  sourceUrl: "https://bergblume.ch",
  status: params.get("paid") === "no" ? "previewed" : "paid",
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
  // The Import hub (/admin/products/import), which is what ADMIN_NAV points at
  // — the CSV importer is a full-screen flow reached from one of its cards.
  import: AdminImport,
  account: ShopProfile,
  me: MyAccount,
  pos: Pos,
  channels: Channels,
  keys: Keys,
  domain: Domain,
  storefront: Storefront,
  insights: Insights,
  testimonials: Testimonials,
  discounts: Discounts,
  sales: Sales,
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
      <TenantProvider slug="bergblume">
        {/* The Navbar reads both contexts (branding, cart count). */}
        <CartProvider>
          <Router hook={hook}>
            <Navbar />
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
        </CartProvider>
      </TenantProvider>
    </QueryClientProvider>
  </trpc.Provider>,
);
