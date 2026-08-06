import { createRoot } from "react-dom/client";
import { Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import "./entry.css";
import Landing from "@/marketing/pages/Landing";
import Sovereignty from "@/marketing/pages/Sovereignty";
import Pricing from "@/marketing/pages/Pricing";
import Compare from "@/marketing/pages/Compare";
import { MarketingShell } from "@/marketing/components/MarketingChrome";

const params = new URLSearchParams(location.search);

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

// Renders the real page. MarketingShell's nav queries tRPC for auth, so the
// page is mounted without the shell by default — the bands themselves are what
// we're checking, and they take no network data.
const useShell = params.has("shell");

createRoot(document.getElementById("root")!).render(
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
  </Router>,
);
