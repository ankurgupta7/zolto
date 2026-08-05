import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const dbMock = vi.hoisted(() => ({
  countTenantProducts: vi.fn(),
  countTenantStaff: vi.fn(),
  getTenantSettings: vi.fn(),
  hasPhotoConsumption: vi.fn(),
}));

vi.mock("./db", () => dbMock);

// billing is partly real (monthlyPhotoCredits reads shared/platform PLANS) but
// isBillingConfigured reads env — keep the module real and control env instead.

import { deriveOnboardingStatus } from "./onboarding";
import type { Tenant } from "../drizzle/schema";

function tenant(over: Partial<Tenant> = {}): Tenant {
  return {
    id: 42,
    plan: "pro",
    stripeConnectedAccountId: null,
    terminalLocationId: null,
    onboardingStep: 0,
    ...over,
  } as Tenant;
}

const PRICE_ENV_VARS = ["STRIPE_PRICE_PRO"] as const;

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.countTenantProducts.mockResolvedValue(0);
  dbMock.countTenantStaff.mockResolvedValue(0);
  dbMock.getTenantSettings.mockResolvedValue(null);
  dbMock.hasPhotoConsumption.mockResolvedValue(false);
  for (const v of PRICE_ENV_VARS) process.env[v] = "price_x";
});

afterEach(() => {
  for (const v of PRICE_ENV_VARS) delete process.env[v];
});

describe("deriveOnboardingStatus", () => {
  it("starts with everything open on a fresh Pro tenant", async () => {
    const s = await deriveOnboardingStatus(tenant());
    expect(s.allDone).toBe(false);
    expect(s.doneCount).toBe(0);
    // pro: 8 tasks (includes staff seats + custom domain)
    expect(s.totalCount).toBe(8);
    expect(s.tasks.map((t) => t.id)).toEqual([
      "claim-admin",
      "brand-store",
      "first-product",
      "connect-stripe",
      "first-ai-photo",
      "invite-staff",
      "custom-domain",
      "pos-ready",
    ]);
  });

  it("completes claim-admin once an admin user exists", async () => {
    dbMock.countTenantStaff.mockResolvedValue(1);
    const s = await deriveOnboardingStatus(tenant());
    expect(s.tasks.find((t) => t.id === "claim-admin")!.done).toBe(true);
  });

  it("completes brand-store from logo OR brand color", async () => {
    dbMock.getTenantSettings.mockResolvedValue({ primaryColor: "#2D6B4A" });
    let s = await deriveOnboardingStatus(tenant());
    expect(s.tasks.find((t) => t.id === "brand-store")!.done).toBe(true);

    dbMock.getTenantSettings.mockResolvedValue({
      logoUrl: "https://x/logo.png",
    });
    s = await deriveOnboardingStatus(tenant());
    expect(s.tasks.find((t) => t.id === "brand-store")!.done).toBe(true);
  });

  it("completes first-product with one product row", async () => {
    dbMock.countTenantProducts.mockResolvedValue(1);
    const s = await deriveOnboardingStatus(tenant());
    expect(s.tasks.find((t) => t.id === "first-product")!.done).toBe(true);
  });

  it("completes connect-stripe and unblocks pos-ready when connected", async () => {
    const s1 = await deriveOnboardingStatus(tenant());
    expect(s1.tasks.find((t) => t.id === "pos-ready")!.blockedReason).toMatch(
      /Connect Stripe first/,
    );

    const s2 = await deriveOnboardingStatus(
      tenant({ stripeConnectedAccountId: "acct_1" }),
    );
    expect(s2.tasks.find((t) => t.id === "connect-stripe")!.done).toBe(true);
    expect(
      s2.tasks.find((t) => t.id === "pos-ready")!.blockedReason,
    ).toBeUndefined();
  });

  it("completes first-ai-photo from a consumption ledger row", async () => {
    dbMock.hasPhotoConsumption.mockResolvedValue(true);
    const s = await deriveOnboardingStatus(tenant());
    expect(s.tasks.find((t) => t.id === "first-ai-photo")!.done).toBe(true);
  });

  it("never blocks first-ai-photo — every plan includes an AI allowance", async () => {
    delete process.env.STRIPE_PRICE_PRO; // even with billing unconfigured
    for (const plan of ["free", "pro"] as const) {
      const s = await deriveOnboardingStatus(tenant({ plan }));
      expect(
        s.tasks.find((t) => t.id === "first-ai-photo")!.blockedReason,
      ).toBeUndefined();
    }
  });

  it("hides plan-gated tasks on the free plan", async () => {
    const s = await deriveOnboardingStatus(tenant({ plan: "free" }));
    expect(s.tasks.find((t) => t.id === "invite-staff")).toBeUndefined();
    expect(s.tasks.find((t) => t.id === "custom-domain")).toBeUndefined();
    expect(s.totalCount).toBe(6);
  });

  it("completes invite-staff at 2+ seats and custom-domain with a domain", async () => {
    dbMock.countTenantStaff.mockResolvedValue(2);
    dbMock.getTenantSettings.mockResolvedValue({
      publicDomain: "shop.example.com",
    });
    const s = await deriveOnboardingStatus(tenant());
    expect(s.tasks.find((t) => t.id === "invite-staff")!.done).toBe(true);
    expect(s.tasks.find((t) => t.id === "custom-domain")!.done).toBe(true);
  });

  it("completes pos-ready once a Terminal location exists", async () => {
    const s = await deriveOnboardingStatus(
      tenant({
        terminalLocationId: "tml_1",
        stripeConnectedAccountId: "acct_1",
      }),
    );
    expect(s.tasks.find((t) => t.id === "pos-ready")!.done).toBe(true);
  });

  it("reports allDone and dismissal from the cursor", async () => {
    dbMock.countTenantStaff.mockResolvedValue(3);
    dbMock.countTenantProducts.mockResolvedValue(2);
    dbMock.hasPhotoConsumption.mockResolvedValue(true);
    dbMock.getTenantSettings.mockResolvedValue({
      logoUrl: "x",
      publicDomain: "shop.example.com",
    });
    const t = tenant({
      stripeConnectedAccountId: "acct_1",
      terminalLocationId: "tml_1",
    });
    const s = await deriveOnboardingStatus(t);
    expect(s.allDone).toBe(true);
    expect(s.doneCount).toBe(s.totalCount);

    const dismissed = await deriveOnboardingStatus(
      tenant({ onboardingStep: -1 }),
    );
    expect(dismissed.dismissed).toBe(true);
  });
});

describe("deriveOnboardingStatus — switching from another provider", () => {
  it("keeps the generic first-product step for a merchant starting fresh", async () => {
    const s = await deriveOnboardingStatus(tenant());
    const task = s.tasks.find((t) => t.id === "first-product");
    expect(task?.title).toBe("Add your first product");
    expect(task?.href).toBe("/admin");
    // The guided "add a product" tour only makes sense on the manual path.
    expect(task?.tourId).toBe("add-product");
  });

  it("points a SumUp switcher at the importer, naming their provider", async () => {
    dbMock.getTenantSettings.mockResolvedValue({ migrateFrom: "sumup" });
    const s = await deriveOnboardingStatus(tenant());
    const task = s.tasks.find((t) => t.id === "first-product");
    expect(task?.title).toBe("Bring your catalogue from SumUp");
    expect(task?.body).toContain("SumUp");
    expect(task?.href).toBe("/admin/products/import");
    // Same task id and count — the checklist shape doesn't change, only its aim.
    expect(s.totalCount).toBe(8);
  });

  it("names Worldline / SIX for a Worldline switcher", async () => {
    dbMock.getTenantSettings.mockResolvedValue({ migrateFrom: "worldline" });
    const s = await deriveOnboardingStatus(tenant());
    const task = s.tasks.find((t) => t.id === "first-product");
    expect(task?.title).toBe("Bring your catalogue from Worldline / SIX");
    expect(task?.href).toBe("/admin/products/import");
  });

  it("ties a Stripe switcher's catalogue import to connecting their account", async () => {
    dbMock.getTenantSettings.mockResolvedValue({ migrateFrom: "stripe" });
    const s = await deriveOnboardingStatus(tenant());
    expect(s.tasks.find((t) => t.id === "first-product")?.title).toBe(
      "Import your Stripe catalogue",
    );
    // The payments step doubles as the import unlock, and says so.
    expect(s.tasks.find((t) => t.id === "connect-stripe")?.body).toContain(
      "one-click catalogue import",
    );
  });

  it("leaves the generic copy for 'other', which has no importer of its own", async () => {
    dbMock.getTenantSettings.mockResolvedValue({ migrateFrom: "other" });
    const s = await deriveOnboardingStatus(tenant());
    expect(s.tasks.find((t) => t.id === "first-product")?.title).toBe(
      "Add your first product",
    );
  });

  it("completes the catalogue step on a real product row, whatever the source", async () => {
    dbMock.getTenantSettings.mockResolvedValue({ migrateFrom: "sumup" });
    dbMock.countTenantProducts.mockResolvedValue(12);
    const s = await deriveOnboardingStatus(tenant());
    expect(s.tasks.find((t) => t.id === "first-product")?.done).toBe(true);
  });
});
