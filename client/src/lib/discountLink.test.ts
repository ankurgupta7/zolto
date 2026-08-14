import { describe, it, expect, beforeEach } from "vitest";
import {
  captureDiscountFromUrl,
  forgetDiscount,
  rememberedDiscount,
  type CodeStorage,
} from "./discountLink";

function memoryStorage(): CodeStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

/** A storage that throws on every call — Safari's private mode, roughly. */
const brokenStorage: CodeStorage = {
  getItem() {
    throw new Error("denied");
  },
  setItem() {
    throw new Error("denied");
  },
  removeItem() {
    throw new Error("denied");
  },
};

let storage: ReturnType<typeof memoryStorage>;
beforeEach(() => {
  storage = memoryStorage();
});

describe("captureDiscountFromUrl", () => {
  it("picks the code out of a share link and remembers it", () => {
    expect(captureDiscountFromUrl("?discount=FRIENDS-7K3P", storage)).toBe(
      "FRIENDS-7K3P",
    );
    expect(rememberedDiscount(storage)).toBe("FRIENDS-7K3P");
  });

  it("works alongside other query parameters", () => {
    expect(
      captureDiscountFromUrl("?utm_source=ig&discount=XMAS-1&page=2", storage),
    ).toBe("XMAS-1");
  });

  it("decodes an escaped code", () => {
    expect(captureDiscountFromUrl("?discount=A%2DB", storage)).toBe("A-B");
  });

  it("returns null when there is no code, and remembers nothing", () => {
    expect(captureDiscountFromUrl("", storage)).toBeNull();
    expect(captureDiscountFromUrl("?utm_source=ig", storage)).toBeNull();
    expect(captureDiscountFromUrl("?discount=", storage)).toBeNull();
    expect(captureDiscountFromUrl("?discount=%20%20", storage)).toBeNull();
    expect(storage.map.size).toBe(0);
  });

  // A second link in the same visit is the shopper's newer intent.
  it("replaces a previously carried code", () => {
    captureDiscountFromUrl("?discount=OLD", storage);
    captureDiscountFromUrl("?discount=NEW", storage);
    expect(rememberedDiscount(storage)).toBe("NEW");
  });

  // Storage failure must not break browsing; the checkout field is still there.
  it("still returns the code when storage refuses to save it", () => {
    expect(captureDiscountFromUrl("?discount=X1", brokenStorage)).toBe("X1");
  });

  it("survives a missing storage entirely", () => {
    expect(captureDiscountFromUrl("?discount=X1", null)).toBe("X1");
    expect(rememberedDiscount(null)).toBeNull();
    expect(() => forgetDiscount(null)).not.toThrow();
  });
});

describe("rememberedDiscount / forgetDiscount", () => {
  it("is empty before anything arrives", () => {
    expect(rememberedDiscount(storage)).toBeNull();
  });

  it("forgets on request", () => {
    captureDiscountFromUrl("?discount=X1", storage);
    forgetDiscount(storage);
    expect(rememberedDiscount(storage)).toBeNull();
  });

  it("reads through a throwing storage as 'no code'", () => {
    expect(rememberedDiscount(brokenStorage)).toBeNull();
  });
});
