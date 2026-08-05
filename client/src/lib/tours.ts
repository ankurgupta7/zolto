/**
 * Tour registry — one GuidedTour step list per onboarding task id
 * (docs/ARCHITECTURE.md §2). Checklist rows reference these by tourId, so the
 * "Show me" button and any "Replay tour" menu share the same definitions.
 *
 * Targets use data-tour="…" attributes in the Admin UI — never CSS classes or
 * DOM position, which break on redesigns. When adding a tour, add the
 * data-tour anchor to the target element in the same commit.
 *
 * Copy lives in the admin locale fragments under `catalog.tour.*`; the steps
 * carry the keys and GuidedTour resolves them (see TourStep in lib/tour.ts).
 */

import type { TourStep } from "@/lib/tour";

export const TOURS: Record<string, TourStep[]> = {
  "add-product": [
    {
      target: '[data-tour="add-product"]',
      titleKey: "catalog.tour.addProduct.add.title",
      bodyKey: "catalog.tour.addProduct.add.body",
      placement: "bottom",
    },
    {
      target: '[data-tour="bulk-upload"]',
      titleKey: "catalog.tour.addProduct.bulk.title",
      bodyKey: "catalog.tour.addProduct.bulk.body",
      placement: "bottom",
    },
  ],
  "connect-stripe": [
    {
      target: '[data-tour="connect-stripe"]',
      titleKey: "catalog.tour.connectStripe.connect.title",
      bodyKey: "catalog.tour.connectStripe.connect.body",
      placement: "bottom",
    },
  ],
};

/** Tour ids that actually have definitions (checklist greys "Show me" otherwise). */
export function hasTour(tourId: string | undefined): tourId is string {
  return !!tourId && tourId in TOURS;
}
