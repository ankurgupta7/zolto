/**
 * Screenshot entry for the public storefront pages.
 *
 * Same approach as admin.tsx: mount the REAL pages behind the REAL
 * TenantProvider and trpc client, stubbing only the transport, so what is
 * captured is what a visitor sees.
 *
 * It exists for the half of the storefront no unit test can check: the pages
 * now render whatever the merchant typed, and a headline long enough to wrap,
 * a banner photo whose subject sits at the edge, or an About body of one
 * enormous paragraph are all things that pass every DOM assertion and look
 * wrong on the page.
 *
 *   npx vite --config tools/screenshot/vite.config.ts &
 *   SHOT_URL="http://localhost:5199/storefront.html?route=/" \
 *     node tools/screenshot/shoot.mjs out/
 *
 * `?route=` picks the page (/, /about, /impressum). `?authored=0` empties the
 * merchant's own copy, which is how every store looked before those fields
 * existed and the state most stores will still be in — worth shooting both.
 * `?whitelabel=1` puts the store on a plan that has switched the "Made with
 * Zolto" footer credit off — the other half of the only footer state that has
 * two answers.
 */

import { createRoot } from "react-dom/client";
import { Route, Router, Switch } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import "./entry.css";
import "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { TenantProvider } from "@/contexts/TenantContext";
import { CartProvider } from "@/contexts/CartContext";
import Home from "@/pages/Home";
import About from "@/pages/About";
import Impressum from "@/pages/Impressum";
import Footer from "@/components/Footer";

const params = new URLSearchParams(location.search);
const route = params.get("route") ?? "/";
const authored = params.get("authored") !== "0";
const whitelabel = params.get("whitelabel") === "1";

/** What the merchant wrote — or nothing, under `?authored=0`. */
const AUTHORED = authored
  ? {
      heroImageUrl: null,
      heroHeadline: "Von Hand gedreht, Stück für Stück",
      heroSubtitle:
        "Steinzeug aus dem Atelier — online bestellen oder bei uns vorbeikommen.",
      aboutBody:
        "Wir haben 2018 mit einem Brennofen und einem kleinen Tisch angefangen.\n\nHeute drehen wir jedes Stück von Hand in unserem Atelier in Basel. Was im Laden steht, steht auch im Shop — derselbe Bestand, dieselben Preise.",
      companyLegalName: "Bergblume Keramik GmbH",
      companyAddress: "Musterstrasse 1\n4051 Basel\nSchweiz",
      vatNumber: "CHE-123.456.789 MWST",
      companyRegistration: "CH-270.3.001.234-5",
    }
  : {};

const PRODUCTS = [
  "Becher «Morgennebel»",
  "Schale gross",
  "Teller flach",
  "Vase schlank",
  "Kanne 1.2 l",
  "Schale klein",
].map((name, i) => ({
  id: i + 1,
  name,
  description: "Auf der Scheibe gedreht, in gedeckten Glasuren.",
  nameEn: name,
  descriptionEn: "Wheel-thrown, in muted glazes.",
  nameDe: name,
  descriptionDe: "Auf der Scheibe gedreht, in gedeckten Glasuren.",
  nameFr: null,
  descriptionFr: null,
  nameIt: null,
  descriptionIt: null,
  price: `${45 + i * 10}.00`,
  category: ["Tassen & Becher", "Schalen", "Teller", "Vasen"][i % 4],
  imageKey: null,
  imageUrl: null,
  visible: true,
  sold: false,
  quantity: 3,
  source: "manual",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
}));

const RESPONSES: Record<string, unknown> = {
  "tenant.getBySlug": {
    id: 42,
    slug: "bergblume",
    name: "Bergblume Keramik",
    plan: whitelabel ? "pro" : "free",
    whiteLabel: whitelabel,
  },
  "tenant.getSettings": {
    logoUrl: null,
    primaryColor: "#3A5A40",
    secondaryColor: "#B08968",
    templateId: null,
    currency: "chf",
    contactEmail: "hello@bergblume.ch",
    instagramHandle: "bergblume.keramik",
    whatsappNumber: null,
    hideZoltoBadge: whitelabel,
    ...AUTHORED,
  },
  "products.list": PRODUCTS,
  // The footer's collection links come from the store's own category list.
  "categories.list": [
    "Tassen & Becher",
    "Schalen",
    "Teller",
    "Vasen",
    "Other",
  ].map((key, i) => ({
    key,
    labelEn: key,
    labelDe: key,
    labelFr: null,
    labelIt: null,
    extraIncludes: [],
    sortOrder: i,
  })),
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

const { hook } = memoryLocation({ path: route, static: true });

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <TenantProvider slug="bergblume">
        {/* ProductCard's "add to cart" reads the cart, so the featured
            carousel on the home page needs the real provider around it. */}
        <CartProvider>
          <Router hook={hook}>
            <Switch>
              <Route path="/about">
                <About />
              </Route>
              <Route path="/impressum">
                <Impressum />
              </Route>
              <Route>
                <Home />
              </Route>
            </Switch>
            {/* The real footer, because the "Made with Zolto" credit lives in
                it and no DOM assertion can tell whether it reads as the
                platform's line or as part of the merchant's own copyright. */}
            <Footer />
          </Router>
        </CartProvider>
      </TenantProvider>
    </QueryClientProvider>
  </trpc.Provider>,
);
