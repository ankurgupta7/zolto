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
import { derivePalette } from "@/lib/palette";
import { getTemplate, DEFAULT_TEMPLATE_ID } from "@shared/templates";

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
 * Applies the tenant's brand color to the document. From the single
 * `primary_color` we derive the whole dark half of the palette — the ink family
 * plus a same-hue accent (see `derivePalette`) — and write each as a `--brand-*`
 * custom property. Every storefront brand class (`bg-[var(--brand-ink)]`,
 * `text-[var(--brand-accent)]`, …) reads these, so a tenant picks one color and
 * the whole storefront re-themes to "<color> + cream". The cream surfaces keep
 * their CSS defaults; we only touch the swatches `derivePalette` returns.
 */
function useApplyBrandColor(primaryColor: string | null) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    // The CSS default ink is Kalakosh's #2D2620; only override when a tenant
    // supplies a different, parseable color.
    if (!primaryColor || primaryColor.toLowerCase() === "#2d2620") return;
    const palette = derivePalette(primaryColor);
    if (!palette) return;
    for (const [prop, value] of Object.entries(palette)) {
      root.style.setProperty(prop, value);
    }
    return () => {
      for (const prop of Object.keys(palette)) {
        root.style.removeProperty(prop);
      }
    };
  }, [primaryColor]);
}

/**
 * Applies the tenant's chosen storefront template (shared/templates.ts) to the
 * document. Templates own the *surface* half of the palette — grounds,
 * surfaces, borders, muted text — which `derivePalette` deliberately leaves
 * alone, so this composes with `useApplyBrandColor` instead of fighting it.
 * No template (or "atelier", whose values equal the CSS defaults) writes
 * nothing, keeping existing stores byte-identical.
 */
function useApplyTemplate(templateId: string | null | undefined) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const template = getTemplate(templateId);
    if (!template || template.id === DEFAULT_TEMPLATE_ID) return;
    const root = document.documentElement;
    for (const [prop, value] of Object.entries(template.cssVars)) {
      root.style.setProperty(prop, value);
    }
    return () => {
      for (const prop of Object.keys(template.cssVars)) {
        root.style.removeProperty(prop);
      }
    };
  }, [templateId]);
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
  useApplyTemplate(settingsQuery.data?.templateId);

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
