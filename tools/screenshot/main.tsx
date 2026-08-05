import { createRoot } from "react-dom/client";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import "./entry.css";
import Landing from "@/marketing/pages/Landing";
import Sovereignty from "@/marketing/pages/Sovereignty";
import { MarketingShell } from "@/marketing/components/MarketingChrome";

const params = new URLSearchParams(location.search);

// Which page to render. Defaults to the landing page; `?page=sovereignty`
// shoots /made-in-switzerland. Add a line here when a new marketing page needs
// looking at — a page with no entry can't be screenshotted, and a page that
// can't be screenshotted ships unseen.
const PAGES = {
  landing: { path: "/", Component: Landing },
  sovereignty: { path: "/made-in-switzerland", Component: Sovereignty },
} as const;

const page = PAGES[(params.get("page") ?? "landing") as keyof typeof PAGES];
const { hook } = memoryLocation({ path: page.path, static: true });
const Page = page.Component;

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
