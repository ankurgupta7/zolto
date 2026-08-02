/**
 * Screenshot entry for tenant admin pages.
 *
 * Same approach as platform.tsx: mount the REAL pages inside the REAL
 * AdminLayout behind the REAL trpc client, and stub only the transport, so
 * what is captured is what ships. `?route=` picks the page.
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
import AdminLayout from "@/components/admin/AdminLayout";
import { ADMIN_NAV } from "@/admin/nav";
import ShopProfile from "@/pages/admin/ShopProfile";
import MyAccount from "@/pages/admin/MyAccount";
import Pos from "@/pages/admin/Pos";
import Channels from "@/pages/admin/Channels";
import Keys from "@/pages/admin/Keys";

const route =
  new URLSearchParams(location.search).get("route") ?? "/admin/account";

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
  },
  "tenant.getStripeConnectUrl": {
    url: "https://connect.stripe.com/…",
    connected: true,
  },
  // Mutation response so the Keys page's post-rotation state (one-time key +
  // scan-to-pair QR) can be captured by clicking through in the shot.
  "tenant.rotatePosApiKey": {
    posApiKey: "pos_live_c1a9f2e84b7d4d21b6f0e5a83912cdEXAMPLE",
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
  "instagram.adminList": [],
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
  account: ShopProfile,
  me: MyAccount,
  pos: Pos,
  channels: Channels,
  keys: Keys,
};

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
        <Switch>
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
    </QueryClientProvider>
  </trpc.Provider>,
);
