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
import catalogEn from "@/admin/locales/catalog.en.json";

/**
 * Resolve a dotted i18next key against the English admin catalog fragment,
 * tolerating pluralised keys (i18next stores `foo_one` / `foo_other`, never a
 * bare `foo`). Used to prove the server only ever names copy that exists —
 * a typo'd key renders the raw dotted path to the merchant.
 */
function enCopy(key: string): string | undefined {
  const at = (path: string) =>
    path
      .split(".")
      .reduce<unknown>(
        (node, part) =>
          node && typeof node === "object"
            ? (node as Record<string, unknown>)[part]
            : undefined,
        catalogEn as unknown,
      );
  const direct = at(key);
  if (typeof direct === "string") return direct;
  const one = at(`${key}_one`);
  return typeof one === "string" ? one : undefined;
}

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

/**
 * i18next-ish: pick the plural form, then substitute {{placeholders}}. The
 * server ships keys rather than sentences, so tests that care about the
 * English wording resolve it the same way the client will.
 */
function renderEn(
  key: string,
  params: Record<string, string | number> = {},
): string {
  const count = params.count;
  const copy =
    typeof count === "number"
      ? (enCopy(`${key}_${count === 1 ? "one" : "other"}`) ?? enCopy(key))
      : enCopy(key);
  return (copy ?? key).replace(/\{\{(\w+)\}\}/g, (_m, name: string) =>
    String(params[name] ?? `{{${name}}}`),
  );
}

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
    expect(
      renderEn(s1.tasks.find((t) => t.id === "pos-ready")!.blockedReasonKey!),
    ).toMatch(/Connect Stripe first/);

    const s2 = await deriveOnboardingStatus(
      tenant({ stripeConnectedAccountId: "acct_1" }),
    );
    expect(s2.tasks.find((t) => t.id === "connect-stripe")!.done).toBe(true);
    expect(
      s2.tasks.find((t) => t.id === "pos-ready")!.blockedReasonKey,
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
        s.tasks.find((t) => t.id === "first-ai-photo")!.blockedReasonKey,
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
    expect(renderEn(task!.titleKey, task!.params)).toBe(
      "Add your first product",
    );
    expect(task?.href).toBe("/admin");
    // The guided "add a product" tour only makes sense on the manual path.
    expect(task?.tourId).toBe("add-product");
  });

  it("points a SumUp switcher at the importer, naming their provider", async () => {
    dbMock.getTenantSettings.mockResolvedValue({ migrateFrom: "sumup" });
    const s = await deriveOnboardingStatus(tenant());
    const task = s.tasks.find((t) => t.id === "first-product");
    // The provider is an interpolation VALUE, not baked into the sentence, so
    // the same key renders in every language with the brand name untouched.
    expect(task?.titleKey).toBe(
      "catalog.onboarding.tasks.firstProduct.migrateTitle",
    );
    expect(task?.bodyKey).toBe(
      "catalog.onboarding.tasks.firstProduct.migrateBody",
    );
    expect(task?.params).toEqual({ provider: "SumUp" });
    expect(renderEn(task!.titleKey, task!.params)).toBe(
      "Bring your catalogue from SumUp",
    );
    expect(renderEn(task!.bodyKey, task!.params)).toContain("SumUp");
    expect(task?.href).toBe("/admin/products/import");
    // Same task id and count — the checklist shape doesn't change, only its aim.
    expect(s.totalCount).toBe(8);
  });

  it("names Worldline / SIX for a Worldline switcher", async () => {
    dbMock.getTenantSettings.mockResolvedValue({ migrateFrom: "worldline" });
    const s = await deriveOnboardingStatus(tenant());
    const task = s.tasks.find((t) => t.id === "first-product");
    expect(task?.params).toEqual({ provider: "Worldline / SIX" });
    expect(renderEn(task!.titleKey, task!.params)).toBe(
      "Bring your catalogue from Worldline / SIX",
    );
    expect(task?.href).toBe("/admin/products/import");
  });

  it("ties a Stripe switcher's catalogue import to connecting their account", async () => {
    dbMock.getTenantSettings.mockResolvedValue({ migrateFrom: "stripe" });
    const s = await deriveOnboardingStatus(tenant());
    const fp = s.tasks.find((t) => t.id === "first-product")!;
    expect(renderEn(fp.titleKey, fp.params)).toBe(
      "Import your Stripe catalogue",
    );
    // The payments step doubles as the import unlock, and says so.
    expect(s.tasks.find((t) => t.id === "connect-stripe")?.bodyKey).toBe(
      "catalog.onboarding.tasks.connectStripe.migrateBody",
    );
    const cs = s.tasks.find((t) => t.id === "connect-stripe")!;
    expect(renderEn(cs.bodyKey, cs.params)).toContain(
      "one-click catalogue import",
    );
  });

  it("leaves the generic copy for 'other', which has no importer of its own", async () => {
    dbMock.getTenantSettings.mockResolvedValue({ migrateFrom: "other" });
    const s = await deriveOnboardingStatus(tenant());
    const fp = s.tasks.find((t) => t.id === "first-product")!;
    expect(renderEn(fp.titleKey, fp.params)).toBe("Add your first product");
  });

  it("completes the catalogue step on a real product row, whatever the source", async () => {
    dbMock.getTenantSettings.mockResolvedValue({ migrateFrom: "sumup" });
    dbMock.countTenantProducts.mockResolvedValue(12);
    const s = await deriveOnboardingStatus(tenant());
    expect(s.tasks.find((t) => t.id === "first-product")?.done).toBe(true);
  });
});

/**
 * The checklist's copy is the CLIENT's to render: the server names it with
 * i18next keys and supplies the interpolation values, so the panel follows the
 * merchant's language rather than the server's. Two things can silently rot:
 * a key that no locale defines (the merchant sees a raw dotted path), and the
 * English literals kept for the not-yet-translated marketing wizard drifting
 * away from the copy the key actually resolves to.
 */
describe("deriveOnboardingStatus — translatable copy", () => {
  /** Every task shape the deriver can emit, across plans and switch-in paths. */
  async function allTaskShapes() {
    const out = [];
    for (const plan of ["free", "pro"] as const) {
      for (const migrateFrom of [
        null,
        "other",
        "sumup",
        "worldline",
        "stripe",
      ]) {
        dbMock.getTenantSettings.mockResolvedValue(
          migrateFrom ? { migrateFrom } : null,
        );
        const s = await deriveOnboardingStatus(tenant({ plan }));
        out.push(...s.tasks);
      }
    }
    return out;
  }

  it("names only keys the English catalogue actually defines", async () => {
    const tasks = await allTaskShapes();
    expect(tasks.length).toBeGreaterThan(0);
    for (const task of tasks) {
      expect(enCopy(task.titleKey), `missing ${task.titleKey}`).toBeTypeOf(
        "string",
      );
      expect(enCopy(task.bodyKey), `missing ${task.bodyKey}`).toBeTypeOf(
        "string",
      );
      if (task.blockedReasonKey) {
        expect(
          enCopy(task.blockedReasonKey),
          `missing ${task.blockedReasonKey}`,
        ).toBeTypeOf("string");
      }
    }
  });

  // The server no longer ships English sentences, so there is nothing to
  // compare against — instead assert every key resolves to real prose rather
  // than echoing its own dotted path back (i18next's miss behaviour).
  it("resolves every key to real English prose, not the key itself", async () => {
    const tasks = await allTaskShapes();
    for (const task of tasks) {
      for (const key of [task.titleKey, task.bodyKey, task.blockedReasonKey]) {
        if (!key) continue;
        const rendered = renderEn(key, task.params);
        expect(rendered, key).not.toBe(key);
        expect(rendered.length, key).toBeGreaterThan(0);
        expect(rendered, key).not.toMatch(/\{\{/); // no unfilled interpolation
      }
    }
  });

  it("passes the seat count as `count` so fr/it can agree the noun", async () => {
    const s = await deriveOnboardingStatus(tenant({ plan: "pro" }));
    const task = s.tasks.find((t) => t.id === "invite-staff")!;
    expect(task.bodyKey).toBe("catalog.onboarding.tasks.inviteStaff.body");
    expect(typeof task.params?.count).toBe("number");
    expect(task.params?.count).toBeGreaterThan(1);
    // The singular form exists too, so the copy can't read "1 staff seats".
    expect(enCopy("catalog.onboarding.tasks.inviteStaff.body_one")).toContain(
      "staff seat —",
    );
  });

  it("blocks pos-ready with a key, not a baked-in English sentence", async () => {
    const s = await deriveOnboardingStatus(tenant());
    const task = s.tasks.find((t) => t.id === "pos-ready")!;
    expect(task.blockedReasonKey).toBe(
      "catalog.onboarding.tasks.posReady.blockedStripe",
    );
    const unblocked = await deriveOnboardingStatus(
      tenant({ stripeConnectedAccountId: "acct_1" }),
    );
    expect(
      unblocked.tasks.find((t) => t.id === "pos-ready")!.blockedReasonKey,
    ).toBeUndefined();
  });
});
