import type { TourStep } from "@/lib/tour";

/** Stable id for the admin dashboard first-run tour. */
export const ADMIN_TOUR_ID = "admin-v1";

/**
 * The coach-mark steps for the store admin dashboard. Each `target` matches a
 * `data-tour="…"` attribute in client/src/pages/Admin.tsx. Order walks a new
 * maker through the day-to-day surface: catalogue → add a product → bulk/CSV
 * imports → AI descriptions → getting paid → insights.
 */
export const ADMIN_TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="admin-title"]',
    title: "Welcome to your catalogue",
    body: "This is your store's control room — add and edit products, import in bulk, and see how the store is doing. Here's a 30-second tour.",
    placement: "bottom",
  },
  {
    target: '[data-tour="add-product"]',
    title: "Add a product",
    body: "Add a single item by hand — name, price, category, photo, and description. The AI can draft the description for you.",
    placement: "bottom",
  },
  {
    target: '[data-tour="csv-import"]',
    title: "Import in bulk",
    body: "Already have a spreadsheet? Import your whole catalogue at once with CSV, and use Bulk Photo Upload to attach images.",
    placement: "bottom",
  },
  {
    target: '[data-tour="auto-translate"]',
    title: "Let AI fill the gaps",
    body: "Auto-Translate and Re-Categorise use AI to complete missing English copy and sort products into the right category — you review before anything is applied.",
    placement: "bottom",
  },
  {
    target: '[data-tour="connect-stripe"]',
    title: "Get paid directly",
    body: "Connect your own Stripe account so your storefront's customers pay straight into it. Until you do, checkout falls back to a manual flow.",
    placement: "left",
  },
  {
    target: '[data-tour="insights"]',
    title: "See what's working",
    body: "Insights summarises your orders and revenue so you can spot your best sellers. That's the tour — you can replay it anytime.",
    placement: "top",
  },
];
