import { describe, it, expect, vi, beforeEach } from "vitest";

const { requestMagicLink, updateOwnDisplayName, windows } = vi.hoisted(() => ({
  requestMagicLink: vi.fn(),
  updateOwnDisplayName: vi.fn(),
  // Stands in for the rate limiter's shared window table. Without it the real
  // getOrCreateRateLimitWindow runs with no DATABASE_URL and fails open by
  // design, so every request would look like the first and the limits below
  // could never be observed.
  windows: new Map<string, { count: number; resetAt: number }>(),
}));
vi.mock("./_core/magicLink", () => ({ requestMagicLink }));
vi.mock("./db", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  updateOwnDisplayName,
  getOrCreateRateLimitWindow: async (
    key: string,
    now: number,
    windowMs: number,
  ) => {
    const existing = windows.get(key);
    if (!existing || now >= existing.resetAt) {
      const fresh = { count: 1, resetAt: now + windowMs };
      windows.set(key, fresh);
      return fresh;
    }
    existing.count += 1;
    return existing;
  },
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function ctx(
  user: Record<string, unknown> | null = null,
  ip?: string,
): TrpcContext {
  return {
    req: { protocol: "https", headers: {}, ip } as never,
    res: {} as never,
    user: user as never,
    tenant: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // The limiters are module-level singletons, so counters would otherwise
  // carry from one test into the next.
  windows.clear();
});

describe("auth.requestMagicLink", () => {
  it("rejects an invalid email before reaching the magic-link module", async () => {
    await expect(
      appRouter
        .createCaller(ctx())
        .auth.requestMagicLink({ email: "not-an-email" }),
    ).rejects.toThrow();
    expect(requestMagicLink).not.toHaveBeenCalled();
  });

  it("forwards the email, next path, and request context", async () => {
    requestMagicLink.mockResolvedValue({ emailed: true });
    const context = ctx();
    const result = await appRouter.createCaller(context).auth.requestMagicLink({
      email: "merchant@example.com",
      next: "/onboarding",
    });

    expect(requestMagicLink).toHaveBeenCalledWith({
      email: "merchant@example.com",
      next: "/onboarding",
      req: context.req,
    });
    expect(result).toEqual({ emailed: true });
  });

  it("works without a next path", async () => {
    requestMagicLink.mockResolvedValue({
      emailed: false,
      previewUrl: "http://x",
    });
    const result = await appRouter
      .createCaller(ctx())
      .auth.requestMagicLink({ email: "merchant@example.com" });

    expect(requestMagicLink).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "merchant@example.com",
        next: undefined,
      }),
    );
    expect(result).toEqual({ emailed: false, previewUrl: "http://x" });
  });
});

/**
 * The endpoint is public and sends mail to any address given to it. Redeeming
 * a link can now open a store admin (server/_core/magicLink.ts), so the two
 * limits bound two different harms: per address, how hard one inbox can be
 * flooded; per IP, one caller sweeping many addresses — which a per-address
 * limit alone never sees, since each address is on its first request.
 */
describe("auth.requestMagicLink rate limiting", () => {
  const send = (email: string, ip = "203.0.113.1") =>
    appRouter.createCaller(ctx(null, ip)).auth.requestMagicLink({ email });

  beforeEach(() => requestMagicLink.mockResolvedValue({ emailed: true }));

  it("allows a burst up to the per-address limit, then refuses", async () => {
    for (let i = 0; i < 5; i++) await send("merchant@example.com");
    expect(requestMagicLink).toHaveBeenCalledTimes(5);

    await expect(send("merchant@example.com")).rejects.toThrow(
      /Too many sign-in links/,
    );
    // Refused before any mail was sent, not after.
    expect(requestMagicLink).toHaveBeenCalledTimes(5);
  });

  // Providers disagree about case, and requestMagicLink lowercases before
  // sending — so the counter has to fold case too, or the limit is per
  // spelling rather than per inbox. (Padding can't reach here: z.string()
  // .email() rejects it before the limiter runs.)
  it("counts one address the same however it is capitalised", async () => {
    for (let i = 0; i < 5; i++) await send("merchant@example.com");
    await expect(send("Merchant@Example.COM")).rejects.toThrow(
      /Too many sign-in links/,
    );
  });

  it("does not let one flooded address block a different merchant", async () => {
    for (let i = 0; i < 5; i++) await send("first@example.com");
    await expect(send("second@example.com")).resolves.toEqual({
      emailed: true,
    });
  });

  it("caps one caller sweeping many addresses", async () => {
    for (let i = 0; i < 20; i++) await send(`user${i}@example.com`);
    // 21st distinct address from the same IP: under the per-address limit,
    // over the per-IP one.
    await expect(send("user20@example.com")).rejects.toThrow(
      /Too many sign-in links/,
    );
  });

  it("does not let one caller's sweep block another IP", async () => {
    for (let i = 0; i < 20; i++) await send(`user${i}@example.com`);
    await expect(send("someone@example.com", "198.51.100.7")).resolves.toEqual({
      emailed: true,
    });
  });

  it("tells the caller how long to wait", async () => {
    for (let i = 0; i < 5; i++) await send("merchant@example.com");
    await expect(send("merchant@example.com")).rejects.toThrow(/\d+ seconds/);
  });
});

// Editing your own profile takes NO user id from the caller — it is scoped to
// ctx.user.id — so there is no shape of this request that edits someone else.
// The test that matters is that an unauthenticated caller cannot reach it at
// all, and that the id written is always the session's own.
describe("auth.updateProfile", () => {
  it("refuses an anonymous caller", async () => {
    await expect(
      appRouter.createCaller(ctx()).auth.updateProfile({ name: "Mallory" }),
    ).rejects.toThrow();
    expect(updateOwnDisplayName).not.toHaveBeenCalled();
  });

  it("writes the session's own id, never one from the input", async () => {
    await appRouter
      .createCaller(ctx({ id: 7, role: "staff", tenantId: 3 }))
      .auth.updateProfile({
        name: "Anna",
        // A caller who tries to name a different user is simply ignored: the
        // input schema has no such field and the handler reads ctx.user.id.
        userId: 999,
      } as never);
    expect(updateOwnDisplayName).toHaveBeenCalledWith(7, "Anna");
  });

  it("rejects an empty or whitespace-only name", async () => {
    const caller = appRouter.createCaller(ctx({ id: 7, role: "staff" }));
    for (const name of ["", "   "]) {
      await expect(caller.auth.updateProfile({ name })).rejects.toThrow();
    }
    expect(updateOwnDisplayName).not.toHaveBeenCalled();
  });

  it("trims before persisting so a padded name is not stored", async () => {
    await appRouter
      .createCaller(ctx({ id: 7, role: "staff" }))
      .auth.updateProfile({ name: "  Anna  " });
    expect(updateOwnDisplayName).toHaveBeenCalledWith(7, "Anna");
  });

  it("rejects a name longer than the column", async () => {
    await expect(
      appRouter
        .createCaller(ctx({ id: 7, role: "staff" }))
        .auth.updateProfile({ name: "x".repeat(256) }),
    ).rejects.toThrow();
    expect(updateOwnDisplayName).not.toHaveBeenCalled();
  });
});
