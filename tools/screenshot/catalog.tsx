/**
 * Screenshot entry for the catalog admin page (client/src/pages/Admin.tsx).
 *
 * Same approach as admin.tsx: mount the REAL page behind the REAL trpc client
 * and stub only the transport. This one exists mainly to check the page at
 * phone width — the header's tool stack is tall enough there that anything it
 * opens further down the page lands off-screen.
 *
 *   npx vite --config tools/screenshot/vite.config.ts &
 *   SHOT_URL="http://localhost:5199/catalog.html" SHOT_VIEWPORT=390x844 \
 *     node tools/screenshot/shoot.mjs out/
 */

import { createRoot } from "react-dom/client";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import "./entry.css";
import { trpc } from "@/lib/trpc";
import { markTourCompleted } from "@/lib/tour";
import { ADMIN_TOUR_ID } from "@/lib/adminTour";
import Admin from "@/pages/Admin";

// The coach marks are a first-run overlay and would cover the page; this shot
// is about the steady state a returning merchant sees. `?tour=1` keeps them,
// for checking that a step can still spotlight a tool the phone header folds
// away — the tour has to unfold it, or it would point at nothing.
if (!new URLSearchParams(location.search).has("tour")) {
  markTourCompleted(ADMIN_TOUR_ID);
}

const product = (over: Record<string, unknown> = {}) => ({
  id: 1,
  name: "Silberring",
  nameEn: "Silver Ring",
  nameDe: null,
  nameFr: null,
  nameIt: null,
  description: "Ein Ring aus Silber",
  descriptionEn: "A silver ring",
  descriptionDe: null,
  descriptionFr: null,
  descriptionIt: null,
  price: "120.00",
  category: "Rings",
  imageUrl: null,
  visible: true,
  sold: false,
  quantity: 2,
  source: "manual",
  ...over,
});

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
    contactPhone: "+41 79 000 00 00",
    currency: "chf",
    twintQrUrl: null,
    vertical: "jewellery",
    verticalDescription: null,
  },
  // Not connected, so the header shows the Connect Stripe button — the state
  // the reported screenshot was taken in.
  "tenant.getStripeConnectUrl": { url: null, connected: false },
  "tenant.onboardingStatus": {
    tasks: [
      {
        id: "claim-admin",
        titleKey: "catalog.onboarding.tasks.claimAdmin.title",
        bodyKey: "catalog.onboarding.tasks.claimAdmin.body",
        done: true,
      },
      {
        id: "first-product",
        titleKey: "catalog.onboarding.tasks.firstProduct.title",
        bodyKey: "catalog.onboarding.tasks.firstProduct.body",
        href: "/admin",
        tourId: "add-product",
        done: false,
      },
    ],
    doneCount: 1,
    totalCount: 2,
    allDone: false,
    cursor: 1,
    dismissed: false,
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
  "products.adminList": [
    product(),
    product({
      id: 2,
      name: "Goldkette",
      nameEn: "Gold Chain",
      price: "240.00",
      category: "Necklaces",
    }),
    product({
      id: 3,
      name: "Brosche",
      nameEn: "Brooch",
      price: "90.00",
      quantity: 0,
      sold: true,
      visible: false,
    }),
  ],
  "products.getBulkLogs": [],
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
  },
});

const trpcClient = trpc.createClient({
  links: [httpBatchLink({ url: "/api/trpc", transformer: superjson })],
});

const { hook } = memoryLocation({ path: "/admin", static: true });

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <Router hook={hook}>
        <Admin />
      </Router>
    </QueryClientProvider>
  </trpc.Provider>,
);
