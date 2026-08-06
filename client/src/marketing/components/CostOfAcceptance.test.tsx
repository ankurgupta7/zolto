import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import {
  basketTable,
  rate,
  BASKET_EXAMPLE_CHF,
} from "@shared/costOfAcceptance";
import { source } from "@shared/sources";
import { CostOfAcceptance } from "./CostOfAcceptance";

afterEach(cleanup);

describe("CostOfAcceptance", () => {
  it("lists every option cheapest first", () => {
    render(<CostOfAcceptance channel="in-person" />);
    const ids = screen
      .getAllByTestId(/^cost-row-/)
      .map((r) => r.dataset.testid!.replace("cost-row-", ""));
    expect(ids).toEqual(
      basketTable(BASKET_EXAMPLE_CHF, "in-person").map((r) => r.rate.id),
    );
  });

  it("shows a competitor above Zolto's card row, because that is the truth", () => {
    // The table exists to correct an impression the old silence created. It
    // only does that if it's allowed to lose — so this asserts we don't win.
    render(<CostOfAcceptance channel="in-person" />);
    const ids = screen
      .getAllByTestId(/^cost-row-/)
      .map((r) => r.dataset.testid!.replace("cost-row-", ""));
    expect(ids.indexOf("sumup-payments-plus")).toBeLessThan(
      ids.indexOf("zolto-card-eea"),
    );
    expect(ids.indexOf("worldline-tap-on-mobile")).toBeLessThan(
      ids.indexOf("zolto-card-eea"),
    );
  });

  it("prints the review's worked figures", () => {
    render(<CostOfAcceptance channel="in-person" />);
    const twint = within(screen.getByTestId("cost-row-zolto-twint-qr"));
    expect(twint.getByText("CHF 0.59")).toBeTruthy();
    expect(twint.getByText("1.30%")).toBeTruthy();
  });

  it("marks the rows Stripe hasn't actually confirmed", () => {
    // Both Swiss-card readings ship visibly unconfirmed rather than one of
    // them shipping silently as fact.
    render(<CostOfAcceptance channel="in-person" />);
    expect(screen.getByTestId("unverified-zolto-card-eea")).toBeTruthy();
    expect(screen.getByTestId("unverified-zolto-card-non-eea")).toBeTruthy();
  });

  it("links every row to its source, with the date it was read", () => {
    render(<CostOfAcceptance channel="in-person" />);
    for (const row of basketTable(BASKET_EXAMPLE_CHF, "in-person")) {
      const s = source(row.rate.sourceId);
      const cell = within(screen.getByTestId(`cost-row-${row.rate.id}`));
      const link = cell.getByRole("link", { name: s.label });
      expect(link.getAttribute("href")).toBe(s.url);
      expect(cell.getByText(new RegExp(s.retrievedOn))).toBeTruthy();
    }
  });

  it("keeps each row's caveat attached to it rather than in a footnote", () => {
    render(<CostOfAcceptance channel="in-person" />);
    const plus = within(screen.getByTestId("cost-row-sumup-payments-plus"));
    expect(plus.getByText(/owed whether or not you sell/i)).toBeTruthy();
  });

  it("explains why the monthly fee is not amortised into the per-sale column", () => {
    // Dividing a subscription by an invented number of sales would decide the
    // winner, which is the failure this whole table is correcting.
    render(<CostOfAcceptance channel="in-person" />);
    expect(screen.getByTestId("cost-of-acceptance-note").textContent).toMatch(
      /decide the winner/i,
    );
  });

  it("shows negotiated options with no number rather than an invented one", () => {
    render(<CostOfAcceptance provider="worldline" />);
    // Named twice — as the offering and inside its explanation — so match the
    // block rather than a single node.
    expect(screen.getByTestId("negotiated-offerings").textContent).toMatch(
      /Saferpay is a gateway, not a shop|Saferpay/,
    );
    expect(screen.getByTestId("negotiated-offerings").textContent).toMatch(
      /negotiated/i,
    );
  });

  it("omits the negotiated block when the provider has none", () => {
    render(<CostOfAcceptance provider="sumup" />);
    expect(screen.queryByTestId("negotiated-offerings")).toBeNull();
  });

  it("filters negotiated options by channel too, not just by provider", () => {
    // Caught by screenshot: the pricing page renders one table per channel, so
    // filtering on provider alone listed Worldline's terminal contract AND its
    // online gateway under both of them.
    const { unmount } = render(<CostOfAcceptance channel="in-person" />);
    let block = screen.getByTestId("negotiated-offerings").textContent!;
    expect(block).toMatch(/terminals/i);
    expect(block).not.toMatch(/Saferpay/);
    unmount();

    render(<CostOfAcceptance channel="online" />);
    block = screen.getByTestId("negotiated-offerings").textContent!;
    expect(block).toMatch(/Saferpay/);
    expect(block).not.toMatch(/portable terminals/i);
  });

  it("shows only Zolto and the named competitor on a compare page", () => {
    // Caught by screenshot: /compare/zolto-vs-worldline was listing SumUp's
    // four rates, which is noise on a page about Worldline.
    render(<CostOfAcceptance provider="worldline" />);
    const ids = screen
      .getAllByTestId(/^cost-row-/)
      .map((r) => r.dataset.testid!.replace("cost-row-", ""));
    expect(ids).toContain("worldline-tap-on-mobile");
    expect(ids).toContain("zolto-twint-qr");
    expect(ids.some((id) => id.startsWith("sumup-"))).toBe(false);
  });

  it("shows the whole field when no competitor is named", () => {
    render(<CostOfAcceptance channel="in-person" />);
    const ids = screen
      .getAllByTestId(/^cost-row-/)
      .map((r) => r.dataset.testid!.replace("cost-row-", ""));
    expect(ids.some((id) => id.startsWith("sumup-"))).toBe(true);
    expect(ids.some((id) => id.startsWith("worldline-"))).toBe(true);
  });

  it("filters by channel", () => {
    render(<CostOfAcceptance channel="online" />);
    expect(screen.queryByTestId("cost-row-zolto-twint-qr")).toBeNull();
    expect(screen.getByTestId("cost-row-sumup-online")).toBeTruthy();
  });

  it("puts SumUp above both Zolto plans in the online table", () => {
    render(<CostOfAcceptance channel="online" />);
    const ids = screen
      .getAllByTestId(/^cost-row-/)
      .map((r) => r.dataset.testid!.replace("cost-row-", ""));
    expect(ids[0]).toBe("sumup-online");
  });

  it("scrolls a wide table inside its own box, not the page", () => {
    // CLAUDE.md: wide content must never make the page scroll sideways on a
    // phone, and this table has four columns.
    const { container } = render(<CostOfAcceptance channel="in-person" />);
    const table = container.querySelector("table")!;
    expect(table.parentElement!.className).toMatch(/overflow-x-auto/);
  });

  it("renders money in lining figures", () => {
    // Cormorant defaults to oldstyle numerals, which renders CHF 0 as "CHF o".
    const { container } = render(<CostOfAcceptance channel="in-person" />);
    const cost = within(
      screen.getByTestId("cost-row-zolto-twint-qr"),
    ).getByText("CHF 0.59");
    expect(cost.className).toMatch(/lining-nums/);
    expect(container).toBeTruthy();
  });

  it("says 'none' rather than CHF 0.00 for an absent monthly fee", () => {
    render(<CostOfAcceptance channel="in-person" />);
    const row = within(screen.getByTestId("cost-row-worldline-tap-on-mobile"));
    expect(rate("worldline-tap-on-mobile").monthlyChf).toBe(0);
    expect(row.getByText("none")).toBeTruthy();
  });
});
