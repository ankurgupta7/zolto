import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import {
  basketTable,
  rate,
  RATES,
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

  it("renders Zolto's card row last, because that is where it lands", () => {
    // The table exists to correct an impression the old silence created. It
    // only does that if it's allowed to lose — and since Stripe confirmed
    // Swiss cards bill at the non-EEA rate, taking a card through Zolto is the
    // dearest in-person option on the page.
    render(<CostOfAcceptance channel="in-person" />);
    const ids = screen
      .getAllByTestId(/^cost-row-/)
      .map((r) => r.dataset.testid!.replace("cost-row-", ""));
    expect(ids.at(-1)).toBe("zolto-card");
    // …and TWINT sits second, which is the argument that survives.
    expect(ids[1]).toBe("zolto-twint-qr");
  });

  it("prints the review's worked figures", () => {
    render(<CostOfAcceptance channel="in-person" />);
    const twint = within(screen.getByTestId("cost-row-zolto-twint-qr"));
    expect(twint.getByText("CHF 0.59")).toBeTruthy();
    expect(twint.getByText("1.30%")).toBeTruthy();
  });

  it("flags an unconfirmed row, and flags nothing while none is unconfirmed", () => {
    // The Swiss-card bucket shipped as two visibly-unconfirmed rows until
    // Stripe answered. Nothing is unconfirmed now, so nothing should carry the
    // badge — but the badge has to keep working for the next such figure.
    render(<CostOfAcceptance channel="in-person" />);
    const unconfirmed = RATES.filter(
      (r) => r.channel === "in-person" && r.confidence === "unverified",
    );
    expect(screen.queryAllByTestId(/^unverified-/)).toHaveLength(
      unconfirmed.length,
    );
    for (const r of unconfirmed) {
      expect(screen.getByTestId(`unverified-${r.id}`)).toBeTruthy();
    }
  });

  it("says on the card row that Zolto adds nothing to Stripe's rate", () => {
    // Being the dearest row is survivable; being the dearest row without
    // saying whose fee it is would not be.
    render(<CostOfAcceptance channel="in-person" />);
    const row = screen.getByTestId("cost-row-zolto-card").textContent!;
    expect(row).toMatch(/adds nothing on top/i);
    expect(row).toMatch(/take it: same register/i);
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

  it("names the channel in the heading, so two tables aren't titled alike", () => {
    // Caught by screenshot: the pricing page stacks both channels, and both
    // said "What one CHF 25 sale costs" — the second table read as the first
    // one printed twice.
    const { unmount } = render(<CostOfAcceptance channel="in-person" />);
    expect(
      screen.getByRole("heading", { name: /sale costs in person/i }),
    ).toBeTruthy();
    unmount();

    render(<CostOfAcceptance channel="online" />);
    expect(
      screen.getByRole("heading", { name: /sale costs online/i }),
    ).toBeTruthy();
    // The sr-only caption is channel-specific too: two tables on one page must
    // not announce themselves identically to a screen reader.
    expect(screen.getByText(/sale taken online on each option/i)).toBeTruthy();
  });

  it("keeps the generic heading when no channel is named", () => {
    render(<CostOfAcceptance provider="worldline" />);
    expect(
      screen.getByRole("heading", { name: /^What one CHF \d+ sale costs$/i }),
    ).toBeTruthy();
  });

  it("can drop the framing paragraphs a second table would repeat verbatim", () => {
    render(<CostOfAcceptance channel="online" showFraming={false} />);
    // Table, heading and the negotiated list stay — only the two paragraphs
    // that frame the comparison as a whole go.
    expect(screen.getAllByTestId(/^cost-row-/).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("heading", { name: /sale costs online/i }),
    ).toBeTruthy();
    expect(screen.getByTestId("negotiated-offerings")).toBeTruthy();
    expect(screen.queryByTestId("cost-of-acceptance-note")).toBeNull();
    // Matched on a phrase unique to the intro: "cheapest first" also ends the
    // sr-only table caption, which stays either way.
    expect(screen.queryByText(/Zolto is not at the top/i)).toBeNull();
  });

  it("shows both framing paragraphs by default", () => {
    render(<CostOfAcceptance channel="online" />);
    expect(screen.getByTestId("cost-of-acceptance-note")).toBeTruthy();
    expect(screen.getByText(/Zolto is not at the top/i)).toBeTruthy();
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

describe("CostOfAcceptance — the intro states the finding, not a softer version", () => {
  it("says every other option beats us on card rate", () => {
    // It used to say "we lose to two of the options below", which was true
    // while Stripe's Swiss-card bucket was unknown and the Zolto card row sat
    // at 1.84%. At the confirmed 2.9% it is the last row, so "two" understated
    // it — and an understated concession is the kind of thing a reader checks
    // against the table directly underneath it.
    // Rendered inside a testid'd block because the intro appears twice on the
    // pricing page — once per channel table — so an unscoped text query is
    // ambiguous.
    render(<CostOfAcceptance channel="in-person" />);
    const intro = screen.getByTestId("cost-of-acceptance").textContent!;
    expect(intro).toMatch(/every other option here beats us/i);
    expect(intro).not.toMatch(/two of the options/i);
  });
});
