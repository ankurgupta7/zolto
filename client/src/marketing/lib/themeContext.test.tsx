import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { THEME_STORAGE_KEY } from "./theme";
import {
  MarketingThemeProvider,
  useMarketingThemeContext,
} from "./themeContext";

/**
 * jsdom has no matchMedia. Every test here needs one, and several need to
 * *change* what it reports mid-test, so the listeners are kept addressable.
 */
function stubMatchMedia(prefersDark: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mql = {
    matches: prefersDark,
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) =>
      listeners.add(fn),
    removeEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) =>
      listeners.delete(fn),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mql),
  );
  return {
    set(next: boolean) {
      mql.matches = next;
      listeners.forEach((fn) => fn({ matches: next } as MediaQueryListEvent));
    },
    listenerCount: () => listeners.size,
  };
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MarketingThemeProvider>{children}</MarketingThemeProvider>
);

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-light");
  stubMatchMedia(false);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useMarketingTheme", () => {
  /**
   * The shipped default is "system", so a first-time visitor's theme is decided
   * entirely by their OS — and `prefers-color-scheme` reporting light is both
   * "chose light" and "said nothing", which is the majority case.
   */
  it("opens light for a visitor whose OS is not in dark mode", () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useMarketingThemeContext(), {
      wrapper,
    });
    expect(result.current.preference).toBe("system");
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("keeps the mahogany bands for a visitor whose OS is in dark mode", () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useMarketingThemeContext(), {
      wrapper,
    });
    expect(result.current.theme).toBe("dark");
    // Dark is the absence of the attribute, not data-theme="dark".
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("restores a stored preference and writes it onto <html>", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    const { result } = renderHook(() => useMarketingThemeContext(), {
      wrapper,
    });
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.getAttribute("data-light")).toBe(
      "parchment",
    );
  });

  // Toggling pins a theme: it stops following the OS, which is the whole point
  // of touching the switch.
  it("toggles, persists, and repaints <html>", () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useMarketingThemeContext(), {
      wrapper,
    });
    expect(result.current.theme).toBe("dark");

    act(() => result.current.toggle());
    expect(result.current.preference).toBe("light");
    expect(result.current.theme).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    act(() => result.current.toggle());
    expect(result.current.theme).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("follows the OS while the preference is 'system'", () => {
    const media = stubMatchMedia(true);
    const { result } = renderHook(() => useMarketingThemeContext(), {
      wrapper,
    });
    act(() => result.current.setPreference("system"));
    expect(result.current.theme).toBe("dark");

    act(() => media.set(false));
    expect(result.current.theme).toBe("light");
  });

  /**
   * A listener attached only while the preference is "system" would hold a
   * stale value from the moment the visitor pinned a theme — so switching back
   * to "system" later would resolve against whatever the OS said on mount.
   */
  it("keeps listening to the OS even while a theme is pinned", () => {
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => useMarketingThemeContext(), {
      wrapper,
    });
    act(() => result.current.setPreference("light"));
    act(() => media.set(true));
    expect(result.current.theme).toBe("light");

    act(() => result.current.setPreference("system"));
    expect(result.current.theme).toBe("dark");
  });

  it("stops listening once unmounted", () => {
    const media = stubMatchMedia(false);
    const { unmount } = renderHook(() => useMarketingThemeContext(), {
      wrapper,
    });
    expect(media.listenerCount()).toBe(1);
    unmount();
    expect(media.listenerCount()).toBe(0);
  });
});

describe("useMarketingThemeContext outside a provider", () => {
  /**
   * The screenshot harness and most component tests mount a page without the
   * shell. Throwing there would make every one of them mount a provider to say
   * something unrelated about a band.
   */
  it("reads the default instead of throwing", () => {
    const { result } = renderHook(() => useMarketingThemeContext());
    expect(result.current.preference).toBe("system");
    expect(() => result.current.toggle()).not.toThrow();
  });
});

describe("one theme, many switches", () => {
  /**
   * The nav bar and the mobile sheet each render a toggle. Two hook instances
   * would agree on the first render and diverge on the first click — one switch
   * flipping while the other still showed the old state.
   */
  function TwoSwitches() {
    const a = useMarketingThemeContext();
    const b = useMarketingThemeContext();
    return (
      <>
        <button type="button" onClick={a.toggle}>
          flip
        </button>
        <span data-testid="a">{a.theme}</span>
        <span data-testid="b">{b.theme}</span>
      </>
    );
  }

  it("keeps every consumer of the provider in step", () => {
    stubMatchMedia(true);
    render(
      <MarketingThemeProvider>
        <TwoSwitches />
      </MarketingThemeProvider>,
    );
    act(() => screen.getByText("flip").click());
    expect(screen.getByTestId("a").textContent).toBe("light");
    expect(screen.getByTestId("b").textContent).toBe("light");
  });
});
