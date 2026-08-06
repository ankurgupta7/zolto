import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { CAPABILITIES, findCompetitor } from "@shared/platform";
import { CapabilityMatrix } from "./CapabilityMatrix";

afterEach(cleanup);

const sumup = findCompetitor("sumup")!;
const worldline = findCompetitor("worldline")!;
const stripe = findCompetitor("stripe")!;

describe("CapabilityMatrix", () => {
  it("renders every row, for both columns", () => {
    render(<CapabilityMatrix competitor={sumup} />);
    for (const row of CAPABILITIES) {
      expect(screen.getByTestId(`capability-${row.key}`)).toBeTruthy();
    }
  });

  it("carries the row Zolto loses", () => {
    // A matrix that only asks questions we win is a scorecard we wrote for
    // ourselves, and it gets discounted on sight.
    render(<CapabilityMatrix competitor={worldline} />);
    const row = within(screen.getByTestId("capability-postfinance"));
    expect(row.getAllByLabelText("no").length).toBeGreaterThan(0);
    expect(row.getAllByLabelText("yes").length).toBeGreaterThan(0);
  });

  it("shows the squeeze play as two opposite gaps", () => {
    const { unmount } = render(<CapabilityMatrix competitor={sumup} />);
    // SumUp: catalogue yes, TWINT no.
    expect(
      within(screen.getByTestId("capability-twint")).getAllByLabelText("no")
        .length,
    ).toBeGreaterThan(0);
    unmount();

    render(<CapabilityMatrix competitor={worldline} />);
    // Worldline: TWINT yes, catalogue no.
    expect(
      within(screen.getByTestId("capability-item-grid")).getAllByLabelText("no")
        .length,
    ).toBeGreaterThan(0);
  });

  it("distinguishes 'not applicable' from 'no'", () => {
    // Worldline doesn't track in-person stock because it has no catalogue to
    // track against. That's a different fact than choosing not to build it.
    render(<CapabilityMatrix competitor={worldline} />);
    const row = within(screen.getByTestId("capability-stock-in-person"));
    expect(row.getAllByLabelText("not applicable").length).toBeGreaterThan(0);
  });

  it("concedes SumUp's till app is further along than ours", () => {
    render(<CapabilityMatrix competitor={sumup} />);
    // The cell holds a support mark and the prose as separate nodes, so match
    // on the row's text rather than on a single element.
    expect(screen.getByTestId("capability-item-grid").textContent).toMatch(
      /better developed than Zolto/i,
    );
  });

  it("concedes SumUp sets up faster than we do", () => {
    render(<CapabilityMatrix competitor={sumup} />);
    expect(screen.getByTestId("capability-setup").textContent).toMatch(
      /under an hour/i,
    );
  });

  it("renders nothing for a competitor we didn't research to this depth", () => {
    // A blank column reads as "no". Absent is the honest state for "we didn't
    // check", and Stripe and Shopify were never in the pricing review.
    const { container } = render(<CapabilityMatrix competitor={stripe} />);
    expect(stripe.capabilities).toBeUndefined();
    expect(container.firstChild).toBeNull();
  });

  it("scrolls inside its own box on a narrow screen", () => {
    const { container } = render(<CapabilityMatrix competitor={sumup} />);
    expect(container.querySelector("table")!.parentElement!.className).toMatch(
      /overflow-x-auto/,
    );
  });
});
