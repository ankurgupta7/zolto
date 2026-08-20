import { describe, it, expect, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  within,
} from "@testing-library/react";
import { PRO_PLAN, PRO_BREAK_EVEN_ONLINE_CHF } from "@shared/platform";
import { BASKET_EXAMPLE_CHF, monthlyStack } from "@shared/costOfAcceptance";
import { FeeCalculator } from "./FeeCalculator";

afterEach(cleanup);

const slider = () => screen.getByRole("slider") as HTMLInputElement;
const verdict = () => screen.getByTestId("fee-calculator-verdict").textContent;

function setSales(chf: number) {
  fireEvent.change(slider(), { target: { value: String(chf) } });
}

describe("FeeCalculator", () => {
  it("exposes the input as a labelled slider", () => {
    render(<FeeCalculator />);
    expect(screen.getByLabelText(/your online sales this month/i)).toBeTruthy();
  });

  // These three assert what GWINN invoices, so they target the headline figure
  // rather than the card. Since the whole-bill breakdown landed, a card can
  // legitimately show the same amount twice — once as our fee and once as a
  // line in the stack — and an unscoped query can no longer tell them apart.
  const freeTotal = () => screen.getByTestId("fee-free-total").textContent;
  const proTotal = () => screen.getByTestId("fee-pro-total").textContent;

  it("charges nothing when there were no online sales", () => {
    render(<FeeCalculator />);
    setSales(0);
    expect(freeTotal()).toBe("CHF 0.00");
    expect(verdict()).toMatch(/we don.t get paid/i);
  });

  it("quotes 1% of online sales on the Free plan", () => {
    render(<FeeCalculator />);
    setSales(1000);
    // 1% of 1000 = 10.00
    expect(freeTotal()).toBe("CHF 10.00");
  });

  it("holds Pro at its flat price no matter the volume", () => {
    render(<FeeCalculator />);
    const flat = `CHF ${PRO_PLAN.priceChf.toFixed(2)}`;
    setSales(500);
    expect(proTotal()).toBe(flat);
    setSales(5000);
    expect(proTotal()).toBe(flat);
  });

  it("recommends Free below break-even, even though Pro is the paid plan", () => {
    render(<FeeCalculator />);
    setSales(PRO_BREAK_EVEN_ONLINE_CHF - 1000);
    expect(verdict()).toMatch(/stay on free/i);
  });

  it("recommends Pro once it genuinely becomes cheaper", () => {
    render(<FeeCalculator />);
    setSales(PRO_BREAK_EVEN_ONLINE_CHF + 1000);
    expect(verdict()).toMatch(
      new RegExp(`${PRO_PLAN.name} would save you`, "i"),
    );
  });

  it("announces the verdict politely for screen readers", () => {
    render(<FeeCalculator />);
    expect(
      screen.getByTestId("fee-calculator-result").getAttribute("aria-live"),
    ).toBe("polite");
  });

  it("says out loud that in-person sales are excluded", () => {
    render(<FeeCalculator />);
    expect(screen.getByText(/free on every plan/i)).toBeTruthy();
  });
});

/**
 * The calculator used to model Gwinn's fee and nothing else, and defended that
 * as an honesty rule. It was the opposite: showing "CHF 0.00" while Stripe took
 * three times our cut was the most misleading thing on the pricing page.
 */
describe("FeeCalculator — the whole bill, not just our slice", () => {
  it("shows what the card processor takes alongside what Gwinn takes", () => {
    render(<FeeCalculator />);
    setSales(2000);
    const stack = within(screen.getByTestId("stack-free"));
    // CHF 2,000 at a CHF 45 basket ≈ 44 orders.
    // Stripe: 2.9% of 2000 = 58.00 + 44 × 0.30 = 13.20 → 71.20. Gwinn: 20.00.
    expect(stack.getByText("CHF 71.20")).toBeTruthy();
    expect(stack.getByText("CHF 20.00")).toBeTruthy();
  });

  it("shows the processor taking more than Gwinn does", () => {
    // The whole point. If this ever flips, the headline claim is safe to make
    // on its own again — until then it isn't.
    render(<FeeCalculator />);
    setSales(2000);
    const free = monthlyStack(2000, BASKET_EXAMPLE_CHF, "free");
    expect(free.processorChf).toBeGreaterThan(free.platformChf);
  });

  it("says in words that the processor's cut is not ours", () => {
    render(<FeeCalculator />);
    expect(screen.getByTestId("fee-calculator-stack-note").textContent).toMatch(
      /goes to them, not to us/i,
    );
  });

  it("concedes on the page that we are not the cheapest card rate", () => {
    render(<FeeCalculator />);
    expect(screen.getByTestId("fee-calculator-stack-note").textContent).toMatch(
      /not the cheapest way to get paid/i,
    );
  });

  it("still shows CHF 0.00 owed to Gwinn in a month with no online sales", () => {
    // The pledge is real and the rebuild must not blur it: with nothing sold
    // online, Gwinn's invoice is genuinely zero.
    render(<FeeCalculator />);
    setSales(0);
    expect(screen.getByTestId("fee-free-total").textContent).toBe("CHF 0.00");
    // ...and with nothing sold, nothing goes to the processor either.
    expect(
      within(screen.getByTestId("stack-free")).getAllByText("CHF 0.00").length,
    ).toBe(3);
  });

  it("asks for the basket size rather than assuming one", () => {
    // Stripe's fixed CHF 0.30 lands per order, so the same monthly volume costs
    // very different amounts depending on how it arrived.
    render(<FeeCalculator />);
    setSales(2000);
    const before = within(screen.getByTestId("stack-free")).getByText(
      "CHF 71.20",
    );
    expect(before).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "CHF 150" }));
    // 2000 / 150 ≈ 13 orders → 58.00 + 3.90 = 61.90
    expect(
      within(screen.getByTestId("stack-free")).getByText("CHF 61.90"),
    ).toBeTruthy();
  });

  it("exposes the basket choice as a labelled radio group", () => {
    render(<FeeCalculator />);
    const group = screen.getByRole("radiogroup");
    expect(group.getAttribute("aria-labelledby")).toBeTruthy();
    expect(
      screen
        .getAllByRole("radio")
        .some((r) => r.getAttribute("aria-checked") === "true"),
    ).toBe(true);
  });
});
