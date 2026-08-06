/**
 * Screenshot entry for the marketing signup wizard.
 *
 * Mounts the REAL Signup page behind the real trpc client with only the
 * transport stubbed (same approach as admin.tsx), so the "Your look" step —
 * logo, color, template cards rendered in that color, and the live preview —
 * is captured exactly as it ships. Drive the wizard by clicking through in
 * the shot (steps are plain buttons); the stubbed brandingFromLogo response
 * below is what the "Colors from logo" button returns.
 *
 *   npx vite --config tools/screenshot/vite.config.ts &
 *   SHOT_URL="http://localhost:5199/signup.html" node tools/screenshot/shoot.mjs out/
 */

import { createRoot } from "react-dom/client";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import "./entry.css";
import { trpc } from "@/lib/trpc";
import Signup from "@/marketing/pages/Signup";

const RESPONSES: Record<string, unknown> = {
  "tenant.brandingFromLogo": {
    primaryColor: "#2F5D3A",
    secondaryColor: "#B8963E",
    suggestedTemplateId: "verdant",
    rationale:
      "Forest green with a warm gold accent — a natural fit for the Verdant look.",
  },
  "tenant.create": {
    tenantId: 42,
    slug: "bergblume",
    trialEndsAt: "2026-08-16T00:00:00.000Z",
    claimToken: "stub",
    logoUrl: "/uploads/logos/42/logo.png",
    posApiKey: "pos_live_stub",
  },
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

const { hook } = memoryLocation({ path: "/signup", static: true });

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <Router hook={hook}>
        <div className="min-h-screen bg-[var(--brand-ground)] font-sans text-[var(--brand-text)]">
          <Signup />
        </div>
      </Router>
    </QueryClientProvider>
  </trpc.Provider>,
);
