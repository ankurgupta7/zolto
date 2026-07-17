import "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { createFetchWithTimeout } from "@/lib/fetchWithTimeout";
import { resolveSurface } from "@/lib/surface";
import { UNAUTHED_ERR_MSG } from "@shared/const";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch: createFetchWithTimeout(),
      // Tell the server which storefront tenant this request is for. The server
      // resolves ctx.tenant from this header (or the host subdomain), and scopes
      // every storefront read to it — so a store only ever sees its own data.
      // Admin procedures ignore this and use the signed-in admin's own tenant.
      headers() {
        if (typeof window === "undefined") return {};
        const { surface, tenantSlug } = resolveSurface({
          hostname: window.location.hostname,
          search: window.location.search,
        });
        return surface === "storefront" && tenantSlug
          ? { "x-tenant-slug": tenantSlug }
          : {};
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
