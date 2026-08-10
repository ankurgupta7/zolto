import { describe, it, expect, vi, beforeEach } from "vitest";

const { requestMagicLink, updateOwnDisplayName } = vi.hoisted(() => ({
  requestMagicLink: vi.fn(),
  updateOwnDisplayName: vi.fn(),
}));
vi.mock("./_core/magicLink", () => ({ requestMagicLink }));
vi.mock("./db", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  updateOwnDisplayName,
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function ctx(user: Record<string, unknown> | null = null): TrpcContext {
  return {
    req: { protocol: "https", headers: {} } as never,
    res: {} as never,
    user: user as never,
    tenant: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
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
