import { describe, it, expect } from "vitest";
import { sanitizeNextUrl } from "./nextUrl";

const ORIGIN = "https://kalakosh.zolto.ch";

describe("sanitizeNextUrl", () => {
  it("absolutizes a rooted path onto the current origin", () => {
    // Must not stay relative: the OAuth callback runs on the canonical host,
    // so a bare "/admin" would land the merchant on zolto.ch, not their store.
    expect(sanitizeNextUrl("/admin/billing", ORIGIN)).toBe(
      `${ORIGIN}/admin/billing`,
    );
  });

  it("keeps a same-origin absolute url, dropping any hash", () => {
    expect(
      sanitizeNextUrl(`${ORIGIN}/admin?tab=plan#section`, ORIGIN),
    ).toBe(`${ORIGIN}/admin?tab=plan`);
  });

  it("rejects another origin", () => {
    expect(sanitizeNextUrl("https://evil.example.com/", ORIGIN)).toBeNull();
    // A different tenant's subdomain is still a different origin.
    expect(sanitizeNextUrl("https://other.zolto.ch/admin", ORIGIN)).toBeNull();
  });

  it("rejects protocol-relative targets that browsers resolve off-origin", () => {
    expect(sanitizeNextUrl("//evil.example.com", ORIGIN)).toBeNull();
    expect(sanitizeNextUrl("/\\evil.example.com", ORIGIN)).toBeNull();
  });

  it("rejects javascript: and other non-http schemes", () => {
    expect(sanitizeNextUrl("javascript:alert(1)", ORIGIN)).toBeNull();
    expect(sanitizeNextUrl("data:text/html,<script>", ORIGIN)).toBeNull();
  });

  it("rejects empty, over-long, and whitespace/control-bearing input", () => {
    expect(sanitizeNextUrl("", ORIGIN)).toBeNull();
    expect(sanitizeNextUrl(null, ORIGIN)).toBeNull();
    expect(sanitizeNextUrl(undefined, ORIGIN)).toBeNull();
    expect(sanitizeNextUrl(`/${"a".repeat(512)}`, ORIGIN)).toBeNull();
    expect(sanitizeNextUrl("/admin\nSet-Cookie: x", ORIGIN)).toBeNull();
    expect(sanitizeNextUrl("/admin page", ORIGIN)).toBeNull();
  });

  it("rejects a bare relative path that isn't rooted", () => {
    // Would otherwise parse as a scheme-less url and resolve unpredictably.
    expect(sanitizeNextUrl("admin", ORIGIN)).toBeNull();
  });
});
