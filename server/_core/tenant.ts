/**
 * Active-tenant resolution for server-side writes.
 *
 * Every row now carries a NOT NULL `tenant_id`. Request-scoped code resolves the
 * tenant from the request (see `_core/context.ts`) and should pass it explicitly.
 * But many write helpers, background jobs, and Stripe webhooks have no request
 * context — for a single-tenant deployment they write to this deployment's tenant.
 *
 * `DEFAULT_TENANT_ID` is that fallback (env-overridable so a self-hosted store can
 * pin its own id). It is NOT a hardcoded "Kalakosh" reference — it is "the tenant
 * this deployment operates as" when no per-request tenant is available. Once
 * multi-tenant routing populates `ctx.tenant` everywhere, callers pass the real id
 * and this fallback stops being exercised on those paths.
 */
export const DEFAULT_TENANT_ID = Number(process.env.DEFAULT_TENANT_ID) || 1;

/** An insert payload whose `tenantId` may be omitted and defaulted downstream. */
export type WithOptionalTenant<T extends { tenantId: number }> = Omit<
  T,
  "tenantId"
> & { tenantId?: number };

/** Fill in `tenantId` with the deployment default when a caller didn't provide one. */
export function withTenant<T extends { tenantId?: number | undefined }>(
  data: T,
): T & { tenantId: number } {
  return { ...data, tenantId: data.tenantId ?? DEFAULT_TENANT_ID };
}
