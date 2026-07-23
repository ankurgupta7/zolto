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
  discordGated: publicProcedure
    .use(checkFeature("discordBot"))
    .query(() => "ok"),
  // Cast an unknown feature key to force the "missing feature" path on a
  // non-starter plan (every real starter-key feature is truthy on growth).
  ssoGated: publicProcedure.use(checkFeature("sso" as never)).query(() => "ok"),
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
    const caller = testRouter.createCaller(ctx({ tenant: tenant("starter") }));
    expect(await caller.tenantOnly()).toBe("ok");
  });

  it("fails with PRECONDITION_FAILED when no tenant is resolved", async () => {
    const caller = testRouter.createCaller(ctx());
    await expect(caller.tenantOnly()).rejects.toThrow(/Tenant required/);
  });
});

describe("checkFeature", () => {
  it("allows a plan that includes the feature", async () => {
    const caller = testRouter.createCaller(ctx({ tenant: tenant("growth") }));
    expect(await caller.discordGated()).toBe("ok");
  });

  it("suggests upgrading to Growth from a starter plan", async () => {
    const caller = testRouter.createCaller(ctx({ tenant: tenant("starter") }));
    await expect(caller.discordGated()).rejects.toThrow(/Growth plan/);
  });

  it("suggests Enterprise when a non-starter plan lacks the feature", async () => {
    const caller = testRouter.createCaller(ctx({ tenant: tenant("growth") }));
    await expect(caller.ssoGated()).rejects.toThrow(/Enterprise plan/);
  });

  it("fails without a tenant context", async () => {
    const caller = testRouter.createCaller(ctx());
    await expect(caller.discordGated()).rejects.toThrow(/No tenant context/);
  });
});
