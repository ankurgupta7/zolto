/**
 * Tour registry — one GuidedTour step list per onboarding task id
 * (docs/ARCHITECTURE.md §2). Checklist rows reference these by tourId, so the
 * "Show me" button and any "Replay tour" menu share the same definitions.
 *
 * Targets use data-tour="…" attributes in the Admin UI — never CSS classes or
 * DOM position, which break on redesigns. When adding a tour, add the
 * data-tour anchor to the target element in the same commit.
 */

import type { TourStep } from "@/lib/tour";

export const TOURS: Record<string, TourStep[]> = {
  "add-product": [
    {
      target: '[data-tour="add-product"]',
      title: "Add your first product",
      body: "Click here. Snap a photo — the AI drafts the title, description and price for you.",
      placement: "bottom",
    },
    {
      target: '[data-tour="bulk-upload"]',
      title: "…or import a whole box",
      body: "Have a tray of pieces? Point your camera at each one — a draft product is created per photo.",
      placement: "bottom",
    },
  ],
  "connect-stripe": [
    {
      target: '[data-tour="connect-stripe"]',
      title: "Connect your Stripe account",
      body: "Click here to link your own Stripe — customers pay directly into it, and it unlocks Tap to Pay in the POS app.",
      placement: "bottom",
    },
  ],
};

/** Tour ids that actually have definitions (checklist greys "Show me" otherwise). */
export function hasTour(tourId: string | undefined): tourId is string {
  return !!tourId && tourId in TOURS;
}
