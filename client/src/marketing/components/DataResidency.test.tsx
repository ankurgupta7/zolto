import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { DATA_RESIDENCY, POSITIONING } from "@shared/platform";
import { DataResidency } from "./DataResidency";

afterEach(cleanup);

function renderBand() {
  const { hook } = memoryLocation({ path: "/", static: true });
  return render(
    <Router hook={hook}>
      <DataResidency />
    </Router>,
  );
}

describe("DataResidency", () => {
  it("leads with the claim", () => {
    renderBand();
    // The heading carries the whole sentence even though the underline only
    // hugs the second half.
    expect(
      screen.getByRole("heading", {
        name: `${DATA_RESIDENCY.headline} ${DATA_RESIDENCY.headlineEmphasis}`,
      }),
    ).toBeTruthy();
  });

  it("states where the servers are, sourced from the shared facts", () => {
    const { container } = renderBand();
    const text = container.textContent ?? "";
    // Typed-in country names would let the band drift from the FAQ, the
    // privacy policy and the llms brief, which all read the same constant.
    expect(text).toContain(DATA_RESIDENCY.provider);
    expect(text).toContain(DATA_RESIDENCY.primaryCountry);
    expect(screen.getByText(DATA_RESIDENCY.body)).toBeTruthy();
  });

  it("renders every point the claim makes", () => {
    renderBand();
    for (const point of DATA_RESIDENCY.points) {
      expect(screen.getByText(point)).toBeTruthy();
    }
  });

  it("shows the sub-processor caveat rather than only the good news", () => {
    // Hosting in Europe is not the same as nothing ever leaving Europe. If this
    // paragraph ever disappears, the band is overclaiming.
    renderBand();
    expect(screen.getByText(DATA_RESIDENCY.caveat)).toBeTruthy();
  });

  it("links to the privacy policy for the detail", () => {
    renderBand();
    expect(
      screen
        .getByRole("link", { name: /privacy policy/i })
        .getAttribute("href"),
    ).toBe(DATA_RESIDENCY.href);
  });

  it("names no competitor and asserts nobody else's hosting", () => {
    // Same discipline as the pricing bands: be specific about Zolto, and let
    // the comparison table handle the contrast. Where a competitor hosts is
    // not something this page can verify.
    const { container } = renderBand();
    const text = container.textContent ?? "";
    for (const incumbent of POSITIONING.incumbents) {
      // Stripe is named in the caveat as our own sub-processor, which is the
      // opposite of a jab at them.
      if (incumbent === "Stripe") continue;
      expect(text).not.toContain(incumbent);
    }
    expect(text).not.toMatch(/shopify/i);
    expect(text).not.toMatch(/unlike (them|other)|nobody else/i);
  });
});
