import { createRoot } from "react-dom/client";
import { Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import "./entry.css";
import { trpc } from "@/lib/trpc";
import Landing from "@/marketing/pages/Landing";
import Sovereignty from "@/marketing/pages/Sovereignty";
import Pricing from "@/marketing/pages/Pricing";
import Compare from "@/marketing/pages/Compare";
import WhyZolto from "@/marketing/pages/WhyZolto";
import { MarketingShell } from "@/marketing/components/MarketingChrome";
import {
  applyTheme,
  readPreference,
  resolveTheme,
} from "@/marketing/lib/theme";

const params = new URLSearchParams(location.search);

// The theme normally arrives with MarketingShell, and the harness mounts pages
// without it (the bands are what we're checking, and the shell's nav wants
// network data). So apply it here too — otherwise SHOT_THEME=light would
// silently shoot the dark surface, which is precisely the bug a light-mode
// screenshot exists to catch. `?theme=light` works as a query param too, for
// eyeballing in a browser.
applyTheme(
  resolveTheme(
    readPreference(location.search),
    window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false,
  ),
  document.documentElement,
);

// Which page to render. Defaults to the landing page; `?page=sovereignty`
// shoots /made-in-switzerland. Add a line here when a new marketing page needs
// looking at — a page with no entry can't be screenshotted, and a page that
// can't be screenshotted ships unseen.
// `route` is needed by any page that reads useParams: wouter only fills params
// for a component mounted under a matching <Route>, so without it Compare sees
// an empty slug and silently renders its index instead of the page you asked
// for — which looks like a successful shot of the wrong thing.
const PAGES = {
  landing: { path: "/", Component: Landing },
  sovereignty: { path: "/made-in-switzerland", Component: Sovereignty },
  pricing: { path: "/pricing", Component: Pricing },
  // The bands the homepage reel could not hold at one viewport each — the
  // agent-purchase proof, the found → asked → bought cards, and the
  // reconciliation email.
  "why-zolto": { path: "/why-zolto", Component: WhyZolto },
  // The index carries the buyer-fit guide and Zolto's own limitations — the
  // two places the site argues against itself, so worth looking at by eye.
  compare: { path: "/compare", route: "/compare", Component: Compare },
  // Worldline is the one carrying the risk section and the negotiated-pricing
  // list, so it's the compare page most worth looking at by eye.
  "compare-worldline": {
    path: "/compare/zolto-vs-worldline",
    route: "/compare/:slug",
    Component: Compare,
  },
  "compare-sumup": {
    path: "/compare/zolto-vs-sumup",
    route: "/compare/:slug",
    Component: Compare,
  },
} as const;

const page = PAGES[(params.get("page") ?? "landing") as keyof typeof PAGES];
const { hook } = memoryLocation({ path: page.path, static: true });
const Component = page.Component;
const routePattern = "route" in page ? page.route : undefined;
const Page = () =>
  routePattern ? (
    <Route path={routePattern} component={Component} />
  ) : (
    <Component />
  );

// Renders the real page. The bands are usually what we're checking and they
// take no network data, so `?shell` is opt-in — but MarketingNav queries tRPC
// for auth, so asking for the shell without a client throws "Unable to find
// tRPC Context" and the shot silently comes back blank. Stub the transport the
// same way signup.tsx does; every query resolves to null, which is exactly the
// logged-out nav the acquisition page shows a first-time visitor.
//
// Shooting the shell is how the nav bar gets looked at at all — the lockup and
// the theme switch live there and nowhere else.
const useShell = params.has("shell");

if (useShell) {
  window.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), location.origin);
    const paths = url.pathname.replace(/^\/api\/trpc\//, "").split(",");
    return new Response(
      JSON.stringify(
        paths.map(() => ({ result: { data: superjson.serialize(null) } })),
      ),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
  },
});
const trpcClient = trpc.createClient({
  links: [httpBatchLink({ url: "/api/trpc", transformer: superjson })],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <Router hook={hook}>
        {useShell ? (
          <MarketingShell>
            <Page />
          </MarketingShell>
        ) : (
          <div className="bg-[var(--brand-ground)] font-sans text-[var(--brand-text)]">
            <Page />
          </div>
        )}
      </Router>
    </QueryClientProvider>
  </trpc.Provider>,
);
