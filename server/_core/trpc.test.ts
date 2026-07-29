import { describe, expect, it } from "vitest";
import type { TrpcContext } from "./context";
import {
  router,
  publicProcedure,
  superadminProcedure,
  checkFeature,
  requireTenant,
} from "./trpc";

const testRouter = router({
  superadminOnly: superadminProcedure.query(() => "ok"),
  tenantOnly: publicProcedure.use(requireTenant).query(() => "ok"),
  domainGated: publicProcedure
    .use(checkFeature("customDomain"))
    .query(() => "ok"),
  multiCurrencyGated: publicProcedure
    .use(checkFeature("multiCurrency"))
    .query(() => "ok"),
});

function ctx(overrides: Partial<TrpcContext> = {}): TrpcContext {
  return {
    user: null,
    tenant: null,
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    ...overrides,
  };
}

function user(role: string) {
  return { id: 1, role } as unknown as NonNullable<TrpcContext["user"]>;
}

function tenant(plan: string) {
  return { id: 7, plan } as unknown as NonNullable<TrpcContext["tenant"]>;
}

describe("superadminProcedure", () => {
  it("allows a superadmin", async () => {
    const caller = testRouter.createCaller(ctx({ user: user("superadmin") }));
    expect(await caller.superadminOnly()).toBe("ok");
  });

  it("forbids an admin", async () => {
    const caller = testRouter.createCaller(ctx({ user: user("admin") }));
    await expect(caller.superadminOnly()).rejects.toThrow(/Superadmin/);
  });

  it("forbids an anonymous request", async () => {
    const caller = testRouter.createCaller(ctx());
    await expect(caller.superadminOnly()).rejects.toThrow(/Superadmin/);
  });
});

describe("requireTenant", () => {
  it("passes through when a tenant is present", async () => {
    const caller = testRouter.createCaller(ctx({ tenant: tenant("free") }));
    expect(await caller.tenantOnly()).toBe("ok");
  });

  it("fails with PRECONDITION_FAILED when no tenant is resolved", async () => {
    const caller = testRouter.createCaller(ctx());
    await expect(caller.tenantOnly()).rejects.toThrow(/Tenant required/);
  });
});

describe("checkFeature", () => {
  it("allows a plan that includes the feature", async () => {
    const caller = testRouter.createCaller(ctx({ tenant: tenant("pro") }));
    expect(await caller.domainGated()).toBe("ok");
  });

  it("suggests upgrading to Pro from the free plan", async () => {
    const caller = testRouter.createCaller(ctx({ tenant: tenant("free") }));
    await expect(caller.domainGated()).rejects.toThrow(/Pro plan/);
  });

  it("gates multi-currency to Pro as well", async () => {
    const caller = testRouter.createCaller(ctx({ tenant: tenant("free") }));
    await expect(caller.multiCurrencyGated()).rejects.toThrow(/Pro plan/);
    const pro = testRouter.createCaller(ctx({ tenant: tenant("pro") }));
    expect(await pro.multiCurrencyGated()).toBe("ok");
  });

  it("fails without a tenant context", async () => {
    const caller = testRouter.createCaller(ctx());
    await expect(caller.domainGated()).rejects.toThrow(/No tenant context/);
  });
});
