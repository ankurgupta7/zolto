import { describe, it, expect } from "vitest";
import { DEFAULT_TENANT_ID, withTenant } from "./tenant";

describe("DEFAULT_TENANT_ID", () => {
  it("defaults to 1 when the env var is unset/invalid", () => {
    // In the test env DEFAULT_TENANT_ID is not set, so it falls back to 1.
    expect(DEFAULT_TENANT_ID).toBe(1);
  });
});

describe("withTenant", () => {
  it("fills in the default tenant id when none is provided", () => {
    expect(withTenant({ name: "x" })).toEqual({
      name: "x",
      tenantId: DEFAULT_TENANT_ID,
    });
  });

  it("preserves an explicitly provided tenant id", () => {
    expect(withTenant({ name: "x", tenantId: 7 })).toEqual({
      name: "x",
      tenantId: 7,
    });
  });

  it("treats an undefined tenantId as absent and defaults it", () => {
    expect(withTenant({ name: "x", tenantId: undefined }).tenantId).toBe(
      DEFAULT_TENANT_ID,
    );
  });

  it("does not mutate the input object", () => {
    const input = { name: "x" };
    withTenant(input);
    expect(input).not.toHaveProperty("tenantId");
  });
});
