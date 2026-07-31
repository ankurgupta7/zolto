import { describe, it, expect, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  within,
} from "@testing-library/react";
import { PRO_PLAN, PRO_BREAK_EVEN_ONLINE_CHF } from "@shared/platform";
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

  it("charges nothing when there were no online sales", () => {
    render(<FeeCalculator />);
    setSales(0);
    expect(screen.getByText("CHF 0.00")).toBeTruthy();
    expect(verdict()).toMatch(/we don.t get paid/i);
  });

  it("quotes 1% of online sales on the Free plan", () => {
    render(<FeeCalculator />);
    setSales(1000);
    // 1% of 1000 = 10.00
    expect(
      within(screen.getByTestId("fee-free")).getByText("CHF 10.00"),
    ).toBeTruthy();
  });

  it("holds Pro at its flat price no matter the volume", () => {
    render(<FeeCalculator />);
    const flat = `CHF ${PRO_PLAN.priceChf.toFixed(2)}`;
    setSales(500);
    expect(within(screen.getByTestId("fee-pro")).getByText(flat)).toBeTruthy();
    setSales(5000);
    expect(within(screen.getByTestId("fee-pro")).getByText(flat)).toBeTruthy();
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
