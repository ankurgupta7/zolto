import { describe, expect, it } from "vitest";
import type { TrpcContext } from "./context";
import {
  router,
  publicProcedure,
  superadminProcedure,
  tenantAdminProcedure,
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
  tenantAdminOnly: tenantAdminProcedure.query(() => "ok"),
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

function user(role: string, tenantId = 7) {
  return { id: 1, role, tenantId } as unknown as NonNullable<
    TrpcContext["user"]
  >;
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

// The guard that every store-admin route now shares. Before it existed, the
// belongs-to-this-tenant check lived in exactly one hand-rolled copy, so any
// route that forgot it was writable across tenants.
describe("tenantAdminProcedure", () => {
  it("allows an admin of the store being addressed", async () => {
    const caller = testRouter.createCaller(
      ctx({ user: user("admin", 7), tenant: tenant("free") }),
    );
    expect(await caller.tenantAdminOnly()).toBe("ok");
  });

  it("refuses an anonymous caller", async () => {
    const caller = testRouter.createCaller(ctx({ tenant: tenant("free") }));
    await expect(caller.tenantAdminOnly()).rejects.toThrow();
  });

  it("refuses a signed-in non-admin", async () => {
    const caller = testRouter.createCaller(
      ctx({ user: user("user", 7), tenant: tenant("free") }),
    );
    await expect(caller.tenantAdminOnly()).rejects.toThrow();
  });

  it("refuses an admin of a DIFFERENT store", async () => {
    // ctx.tenant is resolved from the request host, so this is an admin of
    // store 999 pointing their browser at store 7's subdomain.
    const caller = testRouter.createCaller(
      ctx({ user: user("admin", 999), tenant: tenant("free") }),
    );
    await expect(caller.tenantAdminOnly()).rejects.toThrow();
  });

  it("allows a superadmin acting on a store they don't belong to", async () => {
    // Deliberate exemption: platform support must be able to act on any store,
    // consistent with platform.metrics being cross-tenant by design.
    const caller = testRouter.createCaller(
      ctx({ user: user("superadmin", 1), tenant: tenant("free") }),
    );
    expect(await caller.tenantAdminOnly()).toBe("ok");
  });

  it("refuses when no store is addressed at all", async () => {
    const caller = testRouter.createCaller(ctx({ user: user("admin", 7) }));
    await expect(caller.tenantAdminOnly()).rejects.toThrow(/Tenant required/);
  });
});
