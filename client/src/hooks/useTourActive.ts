import { useSyncExternalStore } from "react";
import { isAnyTourRunning, subscribeTourRunning } from "@/lib/tour";

/**
 * Whether a guided tour is currently running anywhere on the page.
 *
 * Used by UI that hides a `data-tour` anchor behind a disclosure: the tour
 * spotlights elements by selector, so a collapsed menu has to open while a
 * tour is on, or the step would find nothing and be skipped.
 */
export function useTourActive(): boolean {
  return useSyncExternalStore(
    subscribeTourRunning,
    isAnyTourRunning,
    () => false,
  );
}
