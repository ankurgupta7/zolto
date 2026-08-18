import { describe, expect, it, vi } from "vitest";
import { createFakeContext, fakeTenant } from "../fakeContext";
import { askLookbackDays, confirmWrite, withStore } from "./helpers";

describe("withStore", () => {
  it("hands the action the chosen store and its scoped caller", async () => {
    const caller = { marker: true };
    const { ctx } = createFakeContext({ caller });
    const seen = vi.fn(async () => {});

    await withStore(ctx, seen);
    expect(seen).toHaveBeenCalledWith({ tenant: fakeTenant, caller });
  });

  it("says nothing was done when the operator backs out of the picker", async () => {
    const { ctx, fake } = createFakeContext({ tenant: null });
    const seen = vi.fn(async () => {});

    await withStore(ctx, seen);
    expect(seen).not.toHaveBeenCalled();
    expect(fake.text()).toContain("No store chosen — nothing was done.");
  });
});

describe("confirmWrite", () => {
  it("passes on an explicit yes", async () => {
    const { ctx } = createFakeContext({ answers: ["y"] });
    expect(await confirmWrite(ctx, "Do the thing?")).toBe(true);
  });

  it("defaults to no, and says nothing was written", async () => {
    const { ctx, fake } = createFakeContext({ answers: [""] });
    expect(await confirmWrite(ctx, "Do the thing?")).toBe(false);
    expect(fake.text()).toContain("nothing was written");
  });
});

describe("askLookbackDays", () => {
  it("uses the offered default on a bare ⏎", async () => {
    const { ctx } = createFakeContext({ answers: [""] });
    expect(await askLookbackDays(ctx, 90, 7)).toBe(7);
  });

  it("clamps to the procedure's own bounds rather than sending a rejected input", async () => {
    const high = createFakeContext({ answers: ["400"] });
    expect(await askLookbackDays(high.ctx, 90, 7)).toBe(90);

    const low = createFakeContext({ answers: ["0"] });
    expect(await askLookbackDays(low.ctx, 90, 7)).toBe(1);
  });

  it("falls back to the procedure's default when the answer is not a number", async () => {
    const { ctx } = createFakeContext({ answers: ["lots"] });
    expect(await askLookbackDays(ctx, 30, 3)).toBeUndefined();
  });
});
