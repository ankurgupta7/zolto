/**
 * End-to-end walkthroughs of the REAL menu.
 *
 * The other tests check the pieces; these drive the shipped tree with a
 * scripted terminal and a stubbed tRPC caller, so a wire that comes loose —
 * a menu entry pointing at the wrong action, a tier that cannot be reached,
 * an action that asks its questions in a different order than the menu
 * promises — fails here rather than at a prompt on the server.
 */

import { BRAND } from "@shared/brand";
import { describe, expect, it, vi } from "vitest";
import type { Tenant, User } from "../../drizzle/schema";
import type { AdminCaller } from "./caller";
import { createFakeIo } from "./fakeIo";
import { menu } from "./menu";
import { ShellSession } from "./session";
import { runShell } from "./shell";

const operator = {
  id: 1,
  tenantId: 1,
  role: "superadmin",
  email: `owner@${BRAND.domain}`,
  name: "Owner",
  loginMethod: "google",
} as unknown as User;

const kalakosh = {
  id: 3,
  slug: "kalakosh",
  name: "Kalakosh",
  plan: "free",
  compPlan: null,
  compFeeWaived: false,
  compNote: null,
  stripeConnectedAccountId: null,
} as unknown as Tenant;

const storeRow = {
  id: 3,
  slug: "kalakosh",
  name: "Kalakosh",
  plan: "free",
  subscriptionStatus: null,
  trialEndsAt: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  stripeConnected: false,
  comp: null,
  adminCount: 1,
  userCount: 1,
  domain: null,
};

function stubCaller(overrides: Record<string, unknown> = {}) {
  return {
    platform: {
      tenants: vi.fn(async () => [storeRow]),
      tenantDetail: vi.fn(async () => ({
        tenant: { ...storeRow, onboardingStep: 3, referralCode: null },
        users: [
          {
            id: 9,
            email: "owner@example.com",
            name: "Owner",
            role: "admin" as const,
            loginMethod: "google",
            pendingClaim: false,
            lastSignedIn: new Date("2026-03-01T00:00:00Z"),
          },
        ],
      })),
      setTenantPlan: vi.fn(async () => ({ success: true })),
      metrics: vi.fn(async () => ({
        month: "2026-03",
        tenants: { total: 1, free: 1, pro: 0 },
        northStar: {
          freeInPersonVendors: 1,
          freeInPersonVendorsSellingOnline: 0,
          conversionPct: 0,
        },
        online: {
          gmvChf: 0,
          feeChf: 0,
          orders: 0,
          agentGmvChf: 0,
          agentOrders: 0,
          sellingTenants: 0,
        },
        inPerson: { gmvChf: 120, orders: 4, sellingTenants: 1 },
        subscriptions: { active: 0, trialing: 1, pastDue: 0, canceled: 0 },
        model: { feePercentLabel: "1%", proPriceChf: 25 },
      })),
    },
    products: {
      adminList: vi.fn(async () => [
        {
          id: 1,
          name: "Silver ring",
          price: "120.00",
          category: "rings",
          quantity: 2,
          visible: true,
          sold: false,
          imageUrl: null,
          createdAt: new Date("2026-02-01T00:00:00Z"),
        },
      ]),
      setQuantity: vi.fn(async () => ({ success: true })),
    },
    ...overrides,
  } as unknown as AdminCaller;
}

async function run(
  answers: string[],
  opts: { readOnly?: boolean; caller?: AdminCaller } = {},
) {
  const caller = opts.caller ?? stubCaller();
  const fake = createFakeIo(answers);
  const session = new ShellSession({
    io: fake.io,
    operator,
    readOnly: opts.readOnly ?? false,
    deps: {
      listStores: async () => [storeRow],
      loadStore: async () => kalakosh,
      callerFor: () => caller,
    },
  });
  await runShell({ session, root: menu, pauseAfterActions: false });
  return { fake, caller: caller as unknown as ReturnType<typeof stubCaller> };
}

describe("walkthrough: the first thing an operator does", () => {
  it("Stores → List every store", async () => {
    const { fake } = await run(["1", "1", "q"]);
    expect(fake.text()).toContain(`${BRAND.name} admin › Stores`);
    expect(fake.text()).toContain("Stores (1)");
    expect(fake.text()).toContain("kalakosh");
  });

  it("offers the seven top-tier areas by number", async () => {
    const { fake } = await run(["q"]);
    expect(fake.text()).toContain("  1. Stores ›");
    expect(fake.text()).toContain("  2. Plans, subscriptions & comps ›");
    expect(fake.text()).toContain("  7. Platform ›");
  });
});

describe("walkthrough: a store-scoped action asks which store", () => {
  it("Catalogue → List products picks a store first, then remembers it", async () => {
    const { fake } = await run(["4", "1", "kalakosh", "b", "1", "q"]);
    // The picker ran once; the second visit went straight to the catalogue.
    expect(fake.text().match(/Which store\?/g)?.length).toBe(1);
    expect(fake.text()).toContain("Catalogue — kalakosh (1 products)");
    expect(fake.text()).toContain("store: Kalakosh (kalakosh)");
  });
});

describe("walkthrough: a write, end to end", () => {
  it("Catalogue → Set stock quantity restocks the chosen piece", async () => {
    const { fake, caller } = await run([
      "4", // Catalogue & stock
      "4", // Set stock quantity
      "kalakosh", // which store — asked by the action, not by the tier
      "1", // which product
      "6", // new quantity
      "y", // confirm
      "q",
    ]);
    expect(caller.products.setQuantity).toHaveBeenCalledWith({
      id: 1,
      quantity: 6,
    });
    expect(fake.text()).toContain('"Silver ring" is now at 6.');
  });

  it("Plans → Change a store's paid plan moves it to pro", async () => {
    const { caller } = await run(["2", "4", "kalakosh", "pro", "y", "q"]);
    expect(caller.platform.setTenantPlan).toHaveBeenCalledWith({
      tenantId: 3,
      plan: "pro",
    });
  });
});

describe("walkthrough: three tiers deep", () => {
  it("Catalogue → Categories → List categories", async () => {
    const caller = stubCaller({
      categories: {
        list: vi.fn(async () => [
          {
            key: "rings",
            labelEn: "Rings",
            labelDe: null,
            labelFr: null,
            labelIt: null,
            extraIncludes: [],
            sortOrder: 0,
          },
        ]),
      },
    });
    const { fake } = await run(["4", "7", "1", "kalakosh", "q"], { caller });
    expect(fake.text()).toContain(
      `${BRAND.name} admin › Catalogue & stock › Categories`,
    );
    expect(fake.text()).toContain("Categories — kalakosh (1)");
  });
});

describe("walkthrough: read-only", () => {
  it("still reads the platform metrics", async () => {
    const { fake } = await run(["7", "1", "q"], { readOnly: true });
    expect(fake.text()).toContain("operating metrics (2026-03)");
    expect(fake.text()).toContain("READ-ONLY");
  });

  it("refuses the sweep that emails every merchant", async () => {
    const { fake } = await run(["7", "2", "q"], { readOnly: true });
    expect(fake.text()).toContain("was started --read-only");
  });
});

describe("walkthrough: navigation words work at any depth", () => {
  it("? explains, b goes back, q leaves", async () => {
    const { fake } = await run(["3", "?", "b", "q"]);
    expect(fake.text()).toContain(
      `${BRAND.name} admin › People & access — what these do`,
    );
    expect(fake.text()).toContain(
      "Set a user's role (admin / staff)  [writes]",
    );
    expect(fake.text()).toContain("Bye.");
  });
});
