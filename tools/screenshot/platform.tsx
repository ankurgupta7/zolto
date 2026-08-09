/**
 * Screenshot entry for the operator console (zolto.ch/platform).
 *
 * The console's pages read everything through tRPC, so unlike the Landing
 * entry they cannot be mounted bare. Rather than mock the components — which
 * would defeat the point of shooting them — this mounts the REAL PlatformApp
 * behind the REAL trpc client and stubs the network at `fetch`, returning
 * canned superjson-encoded responses. Every component, style, and code path
 * below the transport is the one that ships.
 *
 *   npx vite --config tools/screenshot/vite.config.ts &
 *   SHOT_URL=http://localhost:5199/platform.html node tools/screenshot/shoot.mjs out/
 *
 * `?route=` picks the page: /platform (default), /platform/stores,
 * /platform/stores/42.
 */

import { createRoot } from "react-dom/client";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import "./entry.css";
import { trpc } from "@/lib/trpc";
import PlatformApp from "@/platform/PlatformApp";

const route =
  new URLSearchParams(location.search).get("route") ?? "/platform/stores";

const now = new Date("2026-07-14T00:00:00Z");

const STORES = [
  {
    id: 1,
    slug: "kalakosh",
    name: "Kalakosh",
    domain: "kalakosh.ch",
    plan: "pro",
    subscriptionStatus: "active",
    trialEndsAt: null,
    createdAt: new Date("2025-11-02T00:00:00Z"),
    stripeConnected: true,
    adminCount: 1,
    userCount: 4,
    comp: null,
  },
  {
    id: 42,
    slug: "bergblume",
    name: "Bergblume Keramik",
    domain: null,
    plan: "free",
    subscriptionStatus: "trialing",
    trialEndsAt: new Date("2026-08-01T00:00:00Z"),
    createdAt: new Date("2026-06-18T00:00:00Z"),
    stripeConnected: false,
    adminCount: 0,
    userCount: 2,
    // Comped onto Pro with the skim waived — the grant the operator console
    // exists to make visible. Without a comped store in the fixtures the new
    // pill and the "On the house" card never render in a screenshot.
    comp: {
      plan: "pro" as const,
      feeWaived: true,
      note: "Design partner — first ten stores",
      grantedAt: new Date("2026-06-20T00:00:00Z"),
    },
  },
  {
    id: 7,
    slug: "atelier-sud",
    name: "Atelier Sud",
    domain: null,
    plan: "free",
    subscriptionStatus: "past_due",
    trialEndsAt: null,
    createdAt: new Date("2026-02-09T00:00:00Z"),
    stripeConnected: true,
    adminCount: 2,
    userCount: 5,
    // Fee waived only: still on Free's limits, but Zolto takes no cut.
    comp: {
      plan: null,
      feeWaived: true,
      note: "Outage apology, June",
      grantedAt: new Date("2026-07-02T00:00:00Z"),
    },
  },
];

const RESPONSES: Record<string, unknown> = {
  "auth.me": {
    id: 1,
    role: new URLSearchParams(location.search).get("role") ?? "superadmin",
    email: "anna@bergblume.ch",
  },
  "platform.tenants": STORES,
  "platform.tenantDetail": {
    tenant: {
      ...STORES[1],
      onboardingStep: 2,
      referralCode: "ZOLTO-8F2A",
    },
    users: [
      {
        id: 11,
        email: "anna@bergblume.ch",
        name: "Anna Brunner",
        role: "customer",
        loginMethod: "google",
        pendingClaim: false,
        lastSignedIn: now,
      },
      {
        id: 12,
        email: "team@bergblume.ch",
        name: null,
        role: "staff",
        loginMethod: "magic-link",
        pendingClaim: false,
        lastSignedIn: now,
      },
    ],
  },
  "platform.metrics": {
    month: "2026-07",
    tenants: { total: 34, free: 28, pro: 6 },
    northStar: {
      freeInPersonVendors: 19,
      freeInPersonVendorsSellingOnline: 7,
      conversionPct: 36.8,
    },
    online: {
      gmvChf: 18420.5,
      feeChf: 184.2,
      orders: 212,
      agentGmvChf: 3910,
      agentOrders: 41,
      sellingTenants: 11,
    },
    inPerson: { gmvChf: 72300, orders: 1284, sellingTenants: 22 },
    subscriptions: { active: 6, trialing: 3, pastDue: 1, canceled: 2 },
    model: { feePercentLabel: "1%", proPriceChf: 25 },
  },
};

// Stub the transport, not the components. httpBatchLink sends
// ?batch=1&input={"0":…} and expects an array of {result:{data}} envelopes,
// superjson-encoded because the real client and server both use it.
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
        <PlatformApp />
      </Router>
    </QueryClientProvider>
  </trpc.Provider>,
);
