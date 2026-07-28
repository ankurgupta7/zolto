/**
 * useTenantSettings — shared loader for the admin pages that read and write
 * branding/contact/channel settings (Storefront, Shop profile, Channels).
 *
 * `tenant.getSettings` is keyed by slug (it's the public storefront read), so
 * we first resolve the caller's own slug from `tenant.me`, then fetch settings.
 * The `save` helper wraps `tenant.updateSettings` and invalidates both queries
 * so the form reflects server truth after a write (the "server-truth, not
 * UI-truth" rule from docs/ARCHITECTURE-ADMIN.md §6).
 */

import { trpc } from "@/lib/trpc";

export function useTenantSettings() {
  const utils = trpc.useUtils();
  const me = trpc.tenant.me.useQuery(undefined, { retry: false });
  const slug = me.data?.slug ?? null;

  const settings = trpc.tenant.getSettings.useQuery(
    { slug: slug ?? "" },
    { enabled: !!slug, retry: false },
  );

  const invalidate = () => {
    utils.tenant.me.invalidate();
    if (slug) utils.tenant.getSettings.invalidate({ slug });
  };

  return {
    tenant: me.data ?? null,
    slug,
    settings: settings.data ?? null,
    isLoading: me.isLoading || (!!slug && settings.isLoading),
    invalidate,
  };
}
