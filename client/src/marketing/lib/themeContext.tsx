import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import {
  DEFAULT_PREFERENCE,
  resolveTheme,
  useMarketingTheme,
  type MarketingThemeApi,
} from "./theme";

/**
 * One theme, shared by the whole marketing surface.
 *
 * A context rather than calling useMarketingTheme() at each toggle: the nav bar
 * and the mobile sheet both render a switch, and two hook instances would each
 * own a copy of the state. They'd agree on the first render and diverge on the
 * first click — one switch flipping, the other still showing the old icon,
 * while <html> obeyed whichever effect ran last.
 */
const ThemeContext = createContext<MarketingThemeApi | null>(null);

export function MarketingThemeProvider({ children }: { children: ReactNode }) {
  const api = useMarketingTheme();
  return <ThemeContext.Provider value={api}>{children}</ThemeContext.Provider>;
}

/**
 * Falls back to an inert reading of the default rather than throwing, so a
 * component can be rendered on its own in a test or the screenshot harness
 * without every one of them having to mount the provider.
 */
export function useMarketingThemeContext(): MarketingThemeApi {
  const ctx = useContext(ThemeContext);
  if (ctx) return ctx;
  return {
    preference: DEFAULT_PREFERENCE,
    theme: resolveTheme(DEFAULT_PREFERENCE, false),
    setPreference: () => {},
    toggle: () => {},
  };
}
