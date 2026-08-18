import { describe, expect, it } from "vitest";
import {
  isReviewTokenExpired,
  REVIEW_TOKEN_TTL_DAYS,
  reviewTokenExpiry,
} from "./reviewToken";

describe("reviewTokenExpiry", () => {
  it("dates the expiry TTL days out from the moment of issue", () => {
    const issued = new Date("2026-08-01T09:00:00Z");
    expect(reviewTokenExpiry(issued).toISOString()).toBe(
      new Date("2026-08-15T09:00:00Z").toISOString(),
    );
    expect(REVIEW_TOKEN_TTL_DAYS).toBe(14);
  });
});

describe("isReviewTokenExpired", () => {
  const now = new Date("2026-08-10T12:00:00Z");

  it("lets a link inside its window through", () => {
    expect(
      isReviewTokenExpired(
        { tokenExpiresAt: new Date("2026-08-11T12:00:00Z") },
        now,
      ),
    ).toBe(false);
  });

  it("rejects one past its window", () => {
    expect(
      isReviewTokenExpired(
        { tokenExpiresAt: new Date("2026-08-09T12:00:00Z") },
        now,
      ),
    ).toBe(true);
  });

  it("rejects one expiring exactly now, rather than granting the tick", () => {
    expect(isReviewTokenExpired({ tokenExpiresAt: now }, now)).toBe(true);
  });

  // Fail closed. A missing expiry means something issued a token without a
  // lifetime; reading that as "never expires" would hand out exactly the
  // unbounded credential this exists to prevent.
  it("treats a missing expiry as expired", () => {
    expect(isReviewTokenExpired({ tokenExpiresAt: null }, now)).toBe(true);
  });
});
