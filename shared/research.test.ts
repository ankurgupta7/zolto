import { describe, expect, it } from "vitest";
import {
  PILOT_METHODOLOGY,
  PILOT_METRICS,
  PILOT_WEEKLY,
  PILOT_SOURCES,
  PILOT_FINDINGS,
  renderPilotResearchText,
} from "./research";

describe("pilot research data", () => {
  it("states a sample and a collection method", () => {
    expect(PILOT_METHODOLOGY.sample).toBeTruthy();
    expect(PILOT_METHODOLOGY.collection).toBeTruthy();
  });

  it("publishes its limits, including that Zolto is the vendor", () => {
    expect(PILOT_METHODOLOGY.limits.length).toBeGreaterThan(0);
    const text = PILOT_METHODOLOGY.limits.join(" ").toLowerCase();
    // The disclosure that makes the rest of the page credible.
    expect(text).toContain("zolto operates the platform");
    expect(text).toContain("single store");
  });

  it("keeps the weekly table's total row consistent with the weeks", () => {
    const weeks = PILOT_WEEKLY.rows.filter((r) => !r[0].startsWith("Month"));
    const total = PILOT_WEEKLY.rows.find((r) => r[0].startsWith("Month"))!;

    const orders = weeks.reduce((n, r) => n + Number(r[1]), 0);
    expect(String(orders)).toBe(total[1]);

    const visitors = weeks.reduce((n, r) => n + Number(r[3]), 0);
    expect(String(visitors)).toBe(total[3]);
  });

  it("keeps the headline order count in step with the table", () => {
    const orders = PILOT_METRICS.find((m) =>
      m.label.startsWith("Online orders"),
    )!;
    const total = PILOT_WEEKLY.rows.find((r) => r[0].startsWith("Month"))!;
    expect(orders.value).toBe(total[1]);
  });

  it("has attribution percentages that sum to 100", () => {
    const sum = PILOT_SOURCES.rows.reduce(
      (n, r) => n + Number(r[2].replace("%", "")),
      0,
    );
    expect(sum).toBe(100);
  });

  it("has source order counts matching the month total", () => {
    const sum = PILOT_SOURCES.rows.reduce((n, r) => n + Number(r[1]), 0);
    const total = PILOT_WEEKLY.rows.find((r) => r[0].startsWith("Month"))!;
    expect(String(sum)).toBe(total[1]);
  });

  it("reports the unflattering result rather than omitting it", () => {
    // Search sent zero orders in month one. Publishing the zero is the point.
    const searchRow = PILOT_SOURCES.rows.find((r) => r[0].startsWith("Search"));
    expect(searchRow?.[1]).toBe("0");
    expect(PILOT_FINDINGS.join(" ")).toContain("Search sent zero orders");
  });

  it("renders a plain-text brief carrying the method and the limits", () => {
    const text = renderPilotResearchText();
    expect(text).toContain(PILOT_METHODOLOGY.title);
    expect(text).toContain("Sample:");
    expect(text).toContain("Method:");
    expect(text).toContain("Limits:");
    for (const m of PILOT_METRICS) {
      expect(text).toContain(m.value);
    }
  });
});
