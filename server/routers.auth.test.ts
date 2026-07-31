import { describe, it, expect, vi, beforeEach } from "vitest";

const { requestMagicLink } = vi.hoisted(() => ({
  requestMagicLink: vi.fn(),
}));
vi.mock("./_core/magicLink", () => ({ requestMagicLink }));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function ctx(): TrpcContext {
  return {
    req: { protocol: "https", headers: {} } as never,
    res: {} as never,
    user: null,
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
    const result = await appRouter
      .createCaller(context)
      .auth.requestMagicLink({ email: "merchant@example.com", next: "/onboarding" });

    expect(requestMagicLink).toHaveBeenCalledWith({
      email: "merchant@example.com",
      next: "/onboarding",
      req: context.req,
    });
    expect(result).toEqual({ emailed: true });
  });

  it("works without a next path", async () => {
    requestMagicLink.mockResolvedValue({ emailed: false, previewUrl: "http://x" });
    const result = await appRouter
      .createCaller(ctx())
      .auth.requestMagicLink({ email: "merchant@example.com" });

    expect(requestMagicLink).toHaveBeenCalledWith(
      expect.objectContaining({ email: "merchant@example.com", next: undefined }),
    );
    expect(result).toEqual({ emailed: false, previewUrl: "http://x" });
  });
});
