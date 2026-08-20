import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import {
  CAPABILITIES,
  CAPABILITY_GROUPS,
  capabilitiesInGroup,
  findCompetitor,
} from "@shared/platform";
import { source } from "@shared/sources";
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

  it("groups the rows so payments is one section of four, not the whole table", () => {
    // The matrix used to be ten payment-shaped rows, which conceded the frame:
    // it compared Gwinn to payment companies on payment questions, where the
    // best available outcome is a tie.
    render(<CapabilityMatrix competitor={sumup} />);
    for (const group of CAPABILITY_GROUPS) {
      expect(screen.getByTestId(`capability-group-${group}`)).toBeTruthy();
      expect(capabilitiesInGroup(group).length).toBeGreaterThan(0);
    }
    // The product beyond payments is the larger half of the table.
    const money = capabilitiesInGroup("The money").length;
    expect(CAPABILITIES.length - money).toBeGreaterThan(money * 2);
  });

  it("asks about the whole product, not just the till", () => {
    const keys = CAPABILITIES.map((c) => c.key);
    expect(keys).toContain("online-store");
    expect(keys).toContain("ai-photography");
    expect(keys).toContain("ai-intake");
    expect(keys).toContain("ai-discovery");
    expect(keys).toContain("agent-checkout");
    expect(keys).toContain("multilingual");
  });

  it("carries the rows Gwinn loses", () => {
    // A matrix that only asks questions we win is a scorecard we wrote for
    // ourselves, and it gets discounted on sight. Two rows lose: PostFinance
    // Pay, and the card rate — which is now the dearest on our own table.
    const lost = CAPABILITIES.filter((c) => c.platformSupported === false);
    expect(lost.map((c) => c.key).sort()).toEqual(["card-rate", "postfinance"]);

    render(<CapabilityMatrix competitor={worldline} />);
    const row = within(screen.getByTestId("capability-postfinance"));
    expect(row.getAllByLabelText("no").length).toBeGreaterThan(0);
    expect(row.getAllByLabelText("yes").length).toBeGreaterThan(0);
  });

  it("states our card rate as a figure rather than a shrug", () => {
    render(<CapabilityMatrix competitor={sumup} />);
    const row = screen.getByTestId("capability-card-rate").textContent!;
    expect(row).toMatch(/2\.9% \+ CHF 0\.20/);
    expect(row).toMatch(/we add nothing to it/i);
    // …and SumUp's column says plainly that theirs is cheaper.
    expect(row).toMatch(/cheaper than ours/i);
  });

  it("shows the squeeze play as two opposite gaps", () => {
    const { unmount } = render(<CapabilityMatrix competitor={sumup} />);
    expect(
      within(screen.getByTestId("capability-twint")).getAllByLabelText("no")
        .length,
    ).toBeGreaterThan(0);
    unmount();

    render(<CapabilityMatrix competitor={worldline} />);
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

  it("keeps SumUp's item grid a tick, in the free app", () => {
    // Checked before publishing, because the tempting claim — that the grid is
    // behind a terminal purchase — is false and disprovable in one click.
    // SumUp's catalogue is free, and better developed than ours.
    render(<CapabilityMatrix competitor={sumup} />);
    const row = screen.getByTestId("capability-item-grid").textContent!;
    expect(row).toMatch(/free app/i);
    expect(row).toMatch(/more developed than Gwinn/i);
    expect(row).toMatch(/no terminal needed/i);
  });

  it("concedes SumUp sets up faster than we do", () => {
    render(<CapabilityMatrix competitor={sumup} />);
    expect(screen.getByTestId("capability-setup").textContent).toMatch(
      /faster than ours/i,
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

/**
 * The "yes, but what it costs" line is what makes this table worth publishing
 * at all. A ✕ against a ✓ is a scorecard nobody believes; "yes — on a
 * subscription you owe in a quiet month" is both more honest and more
 * damaging, because a reader can follow the link.
 */
describe("CapabilityMatrix — the cost of a tick", () => {
  it("prices Worldline's shop rather than just calling it absent", () => {
    render(<CapabilityMatrix competitor={worldline} />);
    const cost = screen.getByTestId("cost-online-store").textContent!;
    expect(cost).toMatch(/9\.95/);
    expect(cost).toMatch(/49–299/);
    // …and names the part a price list doesn't cover.
    expect(cost).toMatch(/pay someone to build the site/i);
  });

  it("prices SumUp's cheapest card rate rather than letting it stand alone", () => {
    render(<CapabilityMatrix competitor={sumup} />);
    expect(screen.getByTestId("cost-card-rate").textContent).toMatch(
      /CHF 29\/month, owed whether or not you sell/i,
    );
  });

  it("names Worldline's onboarding as a document pack, not a vibe", () => {
    render(<CapabilityMatrix competitor={worldline} />);
    const row = screen.getByTestId("capability-setup").textContent!;
    expect(row).toMatch(/commercial-register extract/i);
    expect(row).toMatch(/up to a week/i);
    expect(screen.getByTestId("cost-setup").textContent).toMatch(
      /not self-serve/i,
    );
  });

  it("never prints a cost without a source and a date", () => {
    // The rule the August 2026 review exists to enforce. An unsourced cost is
    // exactly the species of claim that got deleted from this site.
    for (const competitor of [sumup, worldline]) {
      const { unmount } = render(<CapabilityMatrix competitor={competitor} />);
      for (const answer of competitor.capabilities ?? []) {
        if (!answer.cost) continue;
        expect(
          answer.costSourceId,
          `${competitor.id}.${answer.key}`,
        ).toBeTruthy();
        const s = source(answer.costSourceId!);
        const cell = screen.getByTestId(`cost-${answer.key}`);
        expect(within(cell).getByRole("link", { name: s.label })).toBeTruthy();
        expect(cell.textContent).toMatch(new RegExp(s.retrievedOn));
      }
      unmount();
    }
  });

  it("shows no cost line on a row that doesn't have one", () => {
    render(<CapabilityMatrix competitor={sumup} />);
    // SumUp simply doesn't do AI photography — there's no price to quote.
    expect(screen.queryByTestId("cost-ai-photography")).toBeNull();
  });
});
