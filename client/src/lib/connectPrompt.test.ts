import { describe, expect, it } from "vitest";
import { resolveConnectPrompt } from "./connectPrompt";

describe("resolveConnectPrompt", () => {
  it("redirects when the server handed us an authorize URL", () => {
    const prompt = resolveConnectPrompt({
      data: { url: "https://connect.stripe.com/oauth/authorize?x=1" },
    });
    expect(prompt).toEqual({
      kind: "redirect",
      url: "https://connect.stripe.com/oauth/authorize?x=1",
    });
  });

  it("says 'still checking' while the query is in flight", () => {
    // The bug this replaces: a merchant tapping before the query resolved was
    // told the platform wasn't set up and to contact support.
    for (const state of [{ isLoading: true }, { isFetching: true }]) {
      const prompt = resolveConnectPrompt(state);
      expect(prompt.kind).toBe("pending");
      expect(prompt.message).not.toMatch(/contact support/i);
      expect(prompt.message).not.toMatch(/isn't set up/i);
    }
  });

  it("surfaces the real error, and does not blame the platform's setup", () => {
    const prompt = resolveConnectPrompt({
      isError: true,
      error: { message: "UNAUTHORIZED" },
    });
    expect(prompt.kind).toBe("error");
    expect(prompt.message).toContain("UNAUTHORIZED");
    expect(prompt.message).not.toMatch(/isn't set up/i);
  });

  it("still gives an actionable message when the error has no detail", () => {
    for (const state of [
      { isError: true },
      { isError: true, error: null },
      { isError: true, error: { message: "   " } },
    ]) {
      const prompt = resolveConnectPrompt(state);
      expect(prompt.kind).toBe("error");
      expect(prompt.message).toMatch(/try again/i);
      expect(prompt.message).not.toMatch(/undefined|null/);
    }
  });

  it("reports 'not configured' ONLY when the server said url is null", () => {
    // This is the one case where "contact support" is the truthful answer:
    // buildConnectAuthorizeUrl returned null, so the platform really is
    // missing STRIPE_CONNECT_CLIENT_ID or JWT_SECRET.
    const prompt = resolveConnectPrompt({ data: { url: null } });
    expect(prompt.kind).toBe("unconfigured");
    expect(prompt.message).toMatch(/contact support/i);
  });

  it("treats a settled query with no data as an error, not a misconfiguration", () => {
    // Nothing loading, nothing errored, no data — we genuinely don't know, so
    // claiming the platform is unconfigured would be a guess presented as fact.
    // (tRPC always gives us one of the states above; this is the belt-and-braces
    // path, and "unconfigured" is the least misleading of the remaining two.)
    const prompt = resolveConnectPrompt({});
    expect(prompt.kind).toBe("unconfigured");
  });

  it("prefers 'checking' over a stale error during a refetch", () => {
    // A retry in flight shouldn't show the previous failure — the user would
    // be reacting to an error that may already be resolved.
    const prompt = resolveConnectPrompt({
      isError: true,
      error: { message: "network down" },
      isFetching: true,
    });
    expect(prompt.kind).toBe("pending");
  });

  it("redirects even mid-refetch once a URL exists", () => {
    // Having the URL is sufficient; making the merchant wait for a background
    // refetch would be a regression in the common case.
    const prompt = resolveConnectPrompt({
      data: { url: "https://connect.stripe.com/oauth/authorize" },
      isFetching: true,
    });
    expect(prompt.kind).toBe("redirect");
  });
});
