/**
 * Screenshot entry for the lost-claim-token recovery states.
 *
 * Mounts the REAL Onboarding and SignIn pages (stacked, labeled) behind the
 * real trpc client with only the transport stubbed, in the exact state a
 * merchant reaches after signup's sign-in failed: signed in with the signup
 * email, no claim token in sessionStorage, and an unclaimed store waiting.
 * Onboarding shows the "your store is waiting" resume card; SignIn shows the
 * "finish setting up" frame instead of the old create-a-store dead end.
 *
 *   npx vite --config tools/screenshot/vite.config.ts &
 *   SHOT_URL="http://localhost:5199/claim.html" node tools/screenshot/shoot.mjs out/
 */

import { createRoot } from "react-dom/client";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import "./entry.css";
import { trpc } from "@/lib/trpc";
import Onboarding from "@/marketing/pages/Onboarding";
import SignIn from "@/marketing/pages/SignIn";

const RESPONSES: Record<string, unknown> = {
  "auth.me": { id: 1, email: "anna@bergblume.ch", name: "Anna" },
  "tenant.myStore": null,
  "tenant.pendingClaim": { slug: "bergblume", name: "Bergblume" },
  "tenant.onboardingStatus": null,
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

// No claim token on purpose: that's the recovery scenario.
try {
  sessionStorage.removeItem("gwinn_claim_token");
} catch {
  /* fine */
}

const onboarding = memoryLocation({
  path: "/onboarding?store=bergblume",
  static: true,
});
const signin = memoryLocation({ path: "/signin?from=oauth", static: true });

function Band({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <p className="border-b border-dashed border-[var(--brand-border-2)] px-6 py-2 font-mono text-xs uppercase tracking-[0.2em] text-[var(--brand-muted)]">
        {label}
      </p>
      {children}
    </section>
  );
}

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-[var(--brand-ground)] font-sans text-[var(--brand-text)]">
        <Band label="/onboarding — lost token, store waiting">
          <Router hook={onboarding.hook} searchHook={onboarding.searchHook}>
            <Onboarding />
          </Router>
        </Band>
        <Band label="/signin — signed in, unclaimed store">
          <Router hook={signin.hook} searchHook={signin.searchHook}>
            <SignIn />
          </Router>
        </Band>
      </div>
    </QueryClientProvider>
  </trpc.Provider>,
);
