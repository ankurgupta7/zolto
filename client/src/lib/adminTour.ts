import type { TourStep } from "@/lib/tour";

/** Stable id for the admin dashboard first-run tour. */
export const ADMIN_TOUR_ID = "admin-v1";

/**
 * The coach-mark steps for the store admin dashboard. Each `target` matches a
 * `data-tour="…"` attribute in client/src/pages/Admin.tsx. Order walks a new
 * maker through the day-to-day surface: catalogue → add a product → bulk/CSV
 * imports → AI descriptions → getting paid → insights.
 *
 * Copy lives in the admin locale fragments under `catalog.tour.admin.*`; the
 * steps carry the keys and GuidedTour resolves them (see TourStep in lib/tour.ts).
 */
export const ADMIN_TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="admin-title"]',
    titleKey: "catalog.tour.admin.welcome.title",
    bodyKey: "catalog.tour.admin.welcome.body",
    placement: "bottom",
  },
  {
    target: '[data-tour="add-product"]',
    titleKey: "catalog.tour.admin.addProduct.title",
    bodyKey: "catalog.tour.admin.addProduct.body",
    placement: "bottom",
  },
  {
    target: '[data-tour="csv-import"]',
    titleKey: "catalog.tour.admin.csvImport.title",
    bodyKey: "catalog.tour.admin.csvImport.body",
    placement: "bottom",
  },
  {
    target: '[data-tour="auto-translate"]',
    titleKey: "catalog.tour.admin.autoTranslate.title",
    bodyKey: "catalog.tour.admin.autoTranslate.body",
    placement: "bottom",
  },
  {
    target: '[data-tour="connect-stripe"]',
    titleKey: "catalog.tour.admin.connectStripe.title",
    bodyKey: "catalog.tour.admin.connectStripe.body",
    placement: "left",
  },
  {
    target: '[data-tour="insights"]',
    titleKey: "catalog.tour.admin.insights.title",
    bodyKey: "catalog.tour.admin.insights.body",
    placement: "top",
  },
];
