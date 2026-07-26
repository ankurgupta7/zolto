/**
 * Money formatting — storefront prices display in the tenant's currency
 * (tenantSettings.currency, default CHF). Multi-currency display is a Studio
 * plan feature; the gate lives server-side in tenant.updateSettings.
 *
 * Everything here is display-only: amounts are stored as plain numbers and
 * Stripe is told the same currency at checkout (server/routers/checkout.ts).
 */

import { useTenant } from "@/contexts/TenantContext";

export const DEFAULT_CURRENCY = "chf";

/**
 * Format a major-unit amount (e.g. 49.9) in the given ISO currency.
 * de-CH locale keeps the Swiss apostrophe thousands separator (CHF 1'299.00)
 * and renders EUR/USD sensibly for Swiss shoppers.
 */
export function formatPrice(amount: number, currency: string): string {
  const code = (currency || DEFAULT_CURRENCY).toUpperCase();
  try {
    return new Intl.NumberFormat("de-CH", {
      style: "currency",
      currency: code,
    }).format(amount);
  } catch {
    // Unknown/invalid currency code — degrade to "CODE 0.00".
    return `${code} ${amount.toFixed(2)}`;
  }
}

/** Smallest-unit helper (Stripe/Rappen → formatted). */
export function formatMinorUnits(minor: number, currency: string): string {
  return formatPrice(minor / 100, currency);
}

/** The active tenant's currency code (lowercase ISO, e.g. "chf"). */
export function useCurrency(): string {
  const { branding } = useTenant();
  return (branding.currency || DEFAULT_CURRENCY).toLowerCase();
}
