import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CARD_READER_GAG, PRO_PLAN, POSITIONING } from "@shared/platform";
import { CardReaderGag } from "./CardReaderGag";

afterEach(cleanup);

describe("CardReaderGag", () => {
  it("lists every alternative from the shared copy", () => {
    render(<CardReaderGag />);
    for (const item of CARD_READER_GAG.items) {
      expect(screen.getByText(item)).toBeTruthy();
    }
  });

  it("lands the punchline with the computed number of Pro months", () => {
    render(<CardReaderGag />);
    expect(
      screen.getByText(
        `${CARD_READER_GAG.proMonths} months of Gwinn ${PRO_PLAN.name}.`,
      ),
    ).toBeTruthy();
  });

  it("shows the anchor figure it is spending", () => {
    render(<CardReaderGag />);
    expect(
      screen.getByText(new RegExp(`CHF ${CARD_READER_GAG.anchorChf}`)),
    ).toBeTruthy();
  });

  it("names no competitor — it jokes about hardware cost, not a rival's bill", () => {
    const { container } = render(<CardReaderGag />);
    const text = container.textContent ?? "";
    for (const incumbent of POSITIONING.incumbents) {
      expect(text).not.toContain(incumbent);
    }
  });
});

describe("CARD_READER_GAG data", () => {
  it("keeps the punchline arithmetic true against the live Pro price", () => {
    expect(CARD_READER_GAG.proMonths).toBe(
      Math.floor(CARD_READER_GAG.anchorChf / PRO_PLAN.priceChf),
    );
    expect(CARD_READER_GAG.proMonths).toBeGreaterThan(0);
  });
});
