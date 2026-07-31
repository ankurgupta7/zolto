import { createRoot } from "react-dom/client";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import "./entry.css";
import Landing from "@/marketing/pages/Landing";
import { MarketingShell } from "@/marketing/components/MarketingChrome";

const { hook } = memoryLocation({ path: "/", static: true });

// Renders the real Landing page. MarketingShell's nav queries tRPC for auth,
// so the page is mounted without the shell — the bands themselves are what
// we're checking, and they take no network data.
const useShell = new URLSearchParams(location.search).has("shell");

createRoot(document.getElementById("root")!).render(
  <Router hook={hook}>
    {useShell ? (
      <MarketingShell>
        <Landing />
      </MarketingShell>
    ) : (
      <div className="bg-[var(--brand-ground)] font-sans text-[var(--brand-text)]">
        <Landing />
      </div>
    )}
  </Router>,
);
