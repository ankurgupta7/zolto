import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { trpc } from "@/lib/trpc";
import {
  brandingFrom,
  defaultsForSlug,
  NEUTRAL_BRANDING,
  type Branding,
} from "@/lib/branding";

interface TenantContextValue {
  slug: string | null;
  branding: Branding;
  /** True while tenant/settings are still loading (defaults are shown meanwhile). */
  isLoading: boolean;
  /** True if the tenant lookup failed (e.g. not seeded) — defaults are used. */
  notFound: boolean;
}

const TenantContext = createContext<TenantContextValue | null>(null);

/**
 * Applies the tenant's brand color to the document as the --brand-ink custom
 * property. Every storefront brand class (`bg-[var(--brand-ink)]` etc.) reads
 * this, so setting it here re-themes the whole storefront. We only override the
 * dominant dark; the warm neutral tints keep their defaults for now (full palette
 * derivation from a single primaryColor is a follow-up).
 */
function useApplyBrandColor(primaryColor: string | null) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    // The CSS default for --brand-ink is Kalakosh's #2D2620; only override when a
    // tenant provides a different color.
    if (primaryColor && primaryColor.toLowerCase() !== "#2d2620") {
      root.style.setProperty("--brand-ink", primaryColor);
      return () => {
        root.style.removeProperty("--brand-ink");
      };
    }
  }, [primaryColor]);
}

export function TenantProvider({
  slug,
  children,
}: {
  slug: string | null;
  children: ReactNode;
}) {
  const enabled = !!slug;

  const tenantQuery = trpc.tenant.getBySlug.useQuery(
    { slug: slug ?? "" },
    { enabled, retry: false, staleTime: 5 * 60 * 1000 },
  );
  const settingsQuery = trpc.tenant.getSettings.useQuery(
    { slug: slug ?? "" },
    { enabled, retry: false, staleTime: 5 * 60 * 1000 },
  );

  const branding = useMemo(
    () =>
      brandingFrom(
        tenantQuery.data?.name,
        settingsQuery.data ?? null,
        defaultsForSlug(slug),
      ),
    [tenantQuery.data?.name, settingsQuery.data, slug],
  );

  useApplyBrandColor(branding.primaryColor);

  const value = useMemo<TenantContextValue>(
    () => ({
      slug,
      branding,
      isLoading: enabled && (tenantQuery.isLoading || settingsQuery.isLoading),
      notFound: enabled && tenantQuery.isError,
    }),
    [
      slug,
      branding,
      enabled,
      tenantQuery.isLoading,
      tenantQuery.isError,
      settingsQuery.isLoading,
    ],
  );

  return (
    <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
  );
}

/**
 * Access the current storefront's branding. Returns Kalakosh defaults if used
 * outside a TenantProvider (e.g. on the marketing surface) so callers never crash.
 */
export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    return {
      slug: null,
      branding: NEUTRAL_BRANDING,
      isLoading: false,
      notFound: false,
    };
  }
  return ctx;
}
