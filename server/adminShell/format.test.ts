import { describe, expect, it } from "vitest";
import {
  describe as describeValue,
  fromMinorUnits,
  heading,
  keyValues,
  money,
  orDash,
  planLabel,
  shortDate,
  table,
  timestamp,
  truncate,
  yesNo,
} from "./format";

describe("orDash", () => {
  it("renders absent values as an em dash rather than null/undefined", () => {
    expect(orDash(null)).toBe("—");
    expect(orDash(undefined)).toBe("—");
    expect(orDash("")).toBe("—");
  });

  it("keeps falsy-but-real values", () => {
    expect(orDash(0)).toBe("0");
    expect(orDash(false)).toBe("false");
  });
});

describe("dates", () => {
  it("renders a date as YYYY-MM-DD and a timestamp to the minute", () => {
    const when = new Date("2026-03-04T09:07:42Z");
    expect(shortDate(when)).toBe("2026-03-04");
    expect(timestamp(when)).toBe("2026-03-04 09:07Z");
  });

  it("accepts the ISO strings procedures return over the wire", () => {
    expect(shortDate("2026-03-04T09:07:42.000Z")).toBe("2026-03-04");
  });

  it("never renders 'Invalid Date' at an operator", () => {
    expect(shortDate("not a date")).toBe("—");
    expect(timestamp(null)).toBe("—");
  });
});

describe("money", () => {
  it("renders minor units with two decimals — CHF 12.50, never CHF 12.5", () => {
    expect(fromMinorUnits(1250)).toBe("CHF 12.50");
    expect(fromMinorUnits(1250, "eur")).toBe("EUR 12.50");
    expect(money(25)).toBe("CHF 25.00");
  });

  it("distinguishes zero from missing", () => {
    expect(fromMinorUnits(0)).toBe("CHF 0.00");
    expect(fromMinorUnits(null)).toBe("—");
  });
});

describe("table", () => {
  const rows = [
    { name: "Ring", qty: 3 },
    { name: "Long necklace", qty: 12 },
  ];
  const lines = table(rows, [
    { label: "name", value: (r) => r.name },
    { label: "qty", align: "right", value: (r) => String(r.qty) },
  ]);

  it("sizes each column to its widest cell", () => {
    expect(lines[0]).toBe("name           qty");
    expect(lines[1]).toBe("─────────────  ───");
  });

  it("right-aligns the columns asked for, so numbers line up", () => {
    expect(lines[2]).toBe("Ring             3");
    expect(lines[3]).toBe("Long necklace   12");
  });

  it("still prints a header for an empty result set", () => {
    expect(table([], [{ label: "name", value: () => "" }])).toEqual([
      "name",
      "────",
    ]);
  });
});

describe("keyValues", () => {
  it("aligns the values into one column", () => {
    expect(
      keyValues([
        ["plan", "pro"],
        ["id", "7"],
      ]),
    ).toEqual(["  plan  pro", "  id    7"]);
  });
});

describe("describe", () => {
  it("flattens nested objects to dotted paths", () => {
    expect(describeValue({ a: { b: 1 } })).toEqual(["  a.b: 1"]);
  });

  it("names each element of an array rather than printing [object Object]", () => {
    expect(describeValue({ xs: [{ id: 1 }, { id: 2 }] })).toEqual([
      "  xs[0].id: 1",
      "  xs[1].id: 2",
    ]);
  });

  it("says (none) for an empty list and — for a null", () => {
    expect(describeValue({ xs: [], y: null })).toEqual([
      "  xs: (none)",
      "  y: —",
    ]);
  });
});

describe("planLabel", () => {
  it("shows a paid plan plainly", () => {
    expect(planLabel({ plan: "pro", comp: null })).toBe("pro");
  });

  it("keeps a comped plan distinguishable from a paid one", () => {
    expect(planLabel({ plan: "free", comp: { plan: "pro" } })).toBe(
      "free (comped: pro)",
    );
  });

  it("shows a waived fee even when no plan was granted", () => {
    expect(planLabel({ plan: "free", comp: { feeWaived: true } })).toBe(
      "free (fee waived)",
    );
  });
});

describe("misc", () => {
  it("truncates with an ellipsis, never past the limit", () => {
    expect(truncate("abcdef", 4)).toBe("abc…");
    expect(truncate("abc", 4)).toBe("abc");
  });

  it("renders booleans as words", () => {
    expect(yesNo(true)).toBe("yes");
    expect(yesNo(null)).toBe("no");
  });

  it("underlines a heading to its own width", () => {
    expect(heading("Stores")).toEqual(["", "Stores", "──────"]);
  });
});
