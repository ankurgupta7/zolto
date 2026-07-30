import { describe, it, expect, vi, beforeEach } from "vitest";

const rows = vi.fn();

vi.mock("./_core/env", () => ({ ENV: {} }));

// Minimal drizzle stand-in: getCategoryPriceStats issues one select, so the
// chain only has to resolve to the row list.
vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: () => ({
    select: () => ({
      from: () => ({ where: (..._a: unknown[]) => rows() }),
    }),
    $client: {
      getConnection: (cb: (e: unknown, c: unknown) => void) =>
        cb(null, { release: vi.fn(), destroy: vi.fn() }),
    },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DATABASE_URL = "mysql://test";
});

async function stats() {
  const { getCategoryPriceStats } = await import("./db");
  return getCategoryPriceStats(7);
}

describe("getCategoryPriceStats", () => {
  it("summarises a merchant's own prices per category", async () => {
    rows.mockResolvedValue([
      { category: "Necklaces", price: "45.00" },
      { category: "Necklaces", price: "65.00" },
      { category: "Necklaces", price: "120.00" },
      { category: "Rings", price: "80.00" },
    ]);
    const result = await stats();
    const necklaces = result.find((r) => r.category === "Necklaces")!;
    expect(necklaces).toEqual({
      category: "Necklaces",
      count: 3,
      minChf: 45,
      maxChf: 120,
      medianChf: 65,
    });
  });

  it("uses the median so one statement piece can't skew the suggestion", async () => {
    // A single CHF 900 piece must not drag the typical price for studs up.
    rows.mockResolvedValue([
      { category: "Earrings", price: "40.00" },
      { category: "Earrings", price: "45.00" },
      { category: "Earrings", price: "50.00" },
      { category: "Earrings", price: "900.00" },
    ]);
    const [earrings] = await stats();
    expect(earrings.medianChf).toBe(47.5);
    expect(earrings.maxChf).toBe(900);
  });

  it("ignores unusable prices rather than skewing the basis", async () => {
    rows.mockResolvedValue([
      { category: "Rings", price: "0.00" },
      { category: "Rings", price: "-5.00" },
      { category: "Rings", price: "not-a-number" },
      { category: "Rings", price: "60.00" },
    ]);
    const [rings] = await stats();
    expect(rings.count).toBe(1);
    expect(rings.medianChf).toBe(60);
  });

  it("returns nothing for a brand-new store — no basis, no suggestion", async () => {
    rows.mockResolvedValue([]);
    expect(await stats()).toEqual([]);
  });
});
