import { describe, expect, it, vi } from "vitest";
import { createFakeContext, fakeTenant } from "../fakeContext";
import {
  chooseWorkingStore,
  clearWorkingStore,
  createStore,
  inspectStore,
  listStores,
} from "./stores";

const twoStores = [
  {
    id: 3,
    slug: "kalakosh",
    name: "Kalakosh",
    plan: "free",
    subscriptionStatus: null,
    trialEndsAt: null,
    createdAt: new Date("2026-01-02T00:00:00Z"),
    stripeConnected: true,
    comp: null,
    adminCount: 1,
    userCount: 2,
    domain: null,
  },
  {
    id: 7,
    slug: "stranded",
    name: "Stranded Store",
    plan: "free",
    subscriptionStatus: null,
    trialEndsAt: null,
    createdAt: new Date("2026-02-02T00:00:00Z"),
    stripeConnected: false,
    comp: {
      plan: "pro",
      feeWaived: true,
      note: "design partner",
      grantedAt: null,
    },
    adminCount: 0,
    userCount: 3,
    domain: "shop.example.com",
  },
];

describe("listStores", () => {
  it("lists every store with its plan and connection state", async () => {
    const { ctx, fake } = createFakeContext({
      platform: { platform: { tenants: async () => twoStores } },
    });
    await listStores(ctx);
    expect(fake.text()).toContain("Stores (2)");
    expect(fake.text()).toContain("kalakosh");
    expect(fake.text()).toContain("free (comped: pro, fee waived)");
  });

  it("points at stores that have users but no admin — the ticket nobody can otherwise see", async () => {
    const { ctx, fake } = createFakeContext({
      platform: { platform: { tenants: async () => twoStores } },
    });
    await listStores(ctx);
    expect(fake.text()).toContain(
      "1 store(s) have users but no admin: stranded",
    );
  });

  it("says so when the platform is empty", async () => {
    const { ctx, fake } = createFakeContext({
      platform: { platform: { tenants: async () => [] } },
    });
    await listStores(ctx);
    expect(fake.text()).toContain("No stores yet.");
  });
});

describe("inspectStore", () => {
  it("shows the store and everyone who can sign in to it", async () => {
    const tenantDetail = vi.fn(async () => ({
      tenant: { ...twoStores[0], onboardingStep: 2, referralCode: "ABC" },
      users: [
        {
          id: 5,
          email: "owner@example.com",
          name: "Owner",
          role: "admin" as const,
          loginMethod: "google",
          pendingClaim: false,
          lastSignedIn: new Date("2026-03-01T08:00:00Z"),
        },
      ],
    }));
    const { ctx, fake } = createFakeContext({
      platform: { platform: { tenantDetail } },
    });

    await inspectStore(ctx);
    expect(tenantDetail).toHaveBeenCalledWith({ tenantId: fakeTenant.id });
    expect(fake.text()).toContain("People (1)");
    expect(fake.text()).toContain("owner@example.com");
  });
});

describe("choosing the working store", () => {
  it("drops the current store before asking, so the picker actually appears", async () => {
    const { ctx, selected } = createFakeContext({});
    await chooseWorkingStore(ctx);
    expect(selected[0]).toBeNull();
  });

  it("reports when the operator ends up with no store", async () => {
    const { ctx, fake } = createFakeContext({ tenant: null });
    await chooseWorkingStore(ctx);
    expect(fake.text()).toContain("Still no store selected.");
  });

  it("clears the working store on request", async () => {
    const { ctx, selected, fake } = createFakeContext({});
    await clearWorkingStore(ctx);
    expect(selected).toEqual([null]);
    expect(fake.text()).toContain("will ask for one");
  });
});

describe("createStore", () => {
  const created = {
    tenantId: 9,
    slug: "new-shop",
    trialEndsAt: "2026-09-01T00:00:00.000Z",
    claimToken: "claim-token-abc",
    claimEmailSent: true,
    logoUrl: null,
    posApiKey: "pos_live_secret",
  };

  it("provisions the store and shows the one-time claim token and POS key", async () => {
    const create = vi.fn(async () => created);
    const { ctx, fake } = createFakeContext({
      answers: ["New Shop", "new-shop", "owner@example.com", "y"],
      platform: { tenant: { create } },
    });

    await createStore(ctx);
    expect(create).toHaveBeenCalledWith({
      name: "New Shop",
      slug: "new-shop",
      email: "owner@example.com",
    });
    expect(fake.text()).toContain("claim-token-abc");
    expect(fake.text()).toContain("pos_live_secret");
    expect(fake.text()).toContain("shown ONCE");
  });

  it("suggests a slug from the name so it need not be typed twice", async () => {
    const create = vi.fn(async () => created);
    const { ctx } = createFakeContext({
      answers: ["Ann's Ceramics!", "", "owner@example.com", "y"],
      platform: { tenant: { create } },
    });

    await createStore(ctx);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "ann-s-ceramics" }),
    );
  });

  it("writes nothing when the confirmation is declined", async () => {
    const create = vi.fn();
    const { ctx } = createFakeContext({
      answers: ["New Shop", "new-shop", "owner@example.com", "n"],
      platform: { tenant: { create } },
    });

    await createStore(ctx);
    expect(create).not.toHaveBeenCalled();
  });

  it("abandons quietly when the name is left blank", async () => {
    const create = vi.fn();
    const { ctx } = createFakeContext({
      answers: [""],
      platform: { tenant: { create } },
    });

    await createStore(ctx);
    expect(create).not.toHaveBeenCalled();
  });
});
