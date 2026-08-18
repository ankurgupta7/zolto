import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  priceBand,
  track,
  trackCartAdd,
  trackCheckoutCompleted,
  trackCheckoutStarted,
  trackProductViewed,
} from "./analytics";

const umamiTrack = vi.fn();

function installTracker() {
  (window as { umami?: unknown }).umami = { track: umamiTrack };
}

beforeEach(() => {
  umamiTrack.mockClear();
  installTracker();
});

afterEach(() => {
  delete (window as { umami?: unknown }).umami;
});

describe("track", () => {
  it("forwards the event to the tracker", () => {
    track("cart_add", { category: "rings" });
    expect(umamiTrack).toHaveBeenCalledWith("cart_add", { category: "rings" });
  });

  it("is a silent no-op when no tracker is present", () => {
    // The default for unconfigured installs, the test suite, the screenshot
    // harness, and any visitor whose blocker ate the script.
    delete (window as { umami?: unknown }).umami;
    expect(() => track("cart_add")).not.toThrow();
  });

  it("survives a half-loaded tracker", () => {
    (window as { umami?: unknown }).umami = {};
    expect(() => track("cart_add")).not.toThrow();
    (window as { umami?: unknown }).umami = { track: "not a function" };
    expect(() => track("cart_add")).not.toThrow();
  });

  it("swallows an error thrown by the tracker itself", () => {
    // Measurement must never be able to break a checkout.
    umamiTrack.mockImplementation(() => {
      throw new Error("blocked by extension");
    });
    expect(() => track("checkout_started")).not.toThrow();
  });
});

describe("priceBand", () => {
  it("buckets an amount rather than reporting it", () => {
    // An exact total is close to an identifier: one CHF 247.50 order on a
    // small store's dashboard is one person, and the policy promises
    // aggregates, not profiles.
    expect(priceBand(0)).toBe("<20");
    expect(priceBand(19.99)).toBe("<20");
    expect(priceBand(20)).toBe("<50");
    expect(priceBand(247.5)).toBe("<500");
    expect(priceBand(999)).toBe("<1000");
    expect(priceBand(5000)).toBe("1000+");
  });

  it("refuses to invent a band for a nonsense amount", () => {
    expect(priceBand(Number.NaN)).toBe("unknown");
    expect(priceBand(-5)).toBe("unknown");
    expect(priceBand(Number.POSITIVE_INFINITY)).toBe("unknown");
  });
});

describe("the storefront events", () => {
  it("reports a product view by category, never by product", () => {
    trackProductViewed("necklaces");
    expect(umamiTrack).toHaveBeenCalledWith("product_viewed", {
      category: "necklaces",
    });
  });

  it("reports a cart add with the resulting bag size", () => {
    trackCartAdd("rings", 3);
    expect(umamiTrack).toHaveBeenCalledWith("cart_add", {
      category: "rings",
      cart_size: 3,
    });
  });

  it("reports checkout start as a band, not a total", () => {
    trackCheckoutStarted(2, 247.5);
    expect(umamiTrack).toHaveBeenCalledWith("checkout_started", {
      items: 2,
      band: "<500",
    });
  });

  it("reports a completed checkout as a band and a currency", () => {
    trackCheckoutCompleted(247.5, "chf");
    expect(umamiTrack).toHaveBeenCalledWith("checkout_completed", {
      band: "<500",
      currency: "CHF",
    });
  });

  it("sends nothing that could identify one shopper", () => {
    // The guard on the rule the whole module is built around. If someone adds
    // an order id, an email or a product id to a payload, this fails.
    trackProductViewed("rings");
    trackCartAdd("rings", 1);
    trackCheckoutStarted(1, 100);
    trackCheckoutCompleted(100, "chf");

    const keys = umamiTrack.mock.calls.flatMap(([, data]) =>
      Object.keys((data ?? {}) as Record<string, unknown>),
    );
    for (const forbidden of [
      "email",
      "name",
      "orderId",
      "order_id",
      "productId",
      "product_id",
      "sessionId",
      "customer",
      "total",
      "amount",
    ]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});
