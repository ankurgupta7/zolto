import { BRAND } from "@shared/brand";
import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { Tenant, User } from "../../drizzle/schema";
import type { AdminCaller } from "./caller";
import { createFakeIo, type FakeIo } from "./fakeIo";
import { ShellSession } from "./session";
import { describeError, runShell } from "./shell";
import type { MenuItem } from "./types";

const operator = {
  id: 1,
  tenantId: 1,
  role: "superadmin",
  email: `owner@${BRAND.domain}`,
} as unknown as User;

function makeSession(fake: FakeIo, readOnly = false) {
  return new ShellSession({
    io: fake.io,
    operator,
    readOnly,
    deps: {
      listStores: async () => [],
      loadStore: async () => null,
      callerFor: (tenant: Tenant | null) =>
        ({ tenant }) as unknown as AdminCaller,
    },
  });
}

function makeTree(run: () => Promise<void>): MenuItem {
  return {
    key: "root",
    title: `${BRAND.name} admin`,
    children: [
      {
        key: "stores",
        title: "Stores",
        children: [
          { key: "stores.list", title: "List every store", run },
          {
            key: "stores.create",
            title: "Create a store",
            mutates: true,
            run,
          },
        ],
      },
    ],
  };
}

async function drive(answers: string[], readOnly = false) {
  const action = vi.fn(async () => {});
  const fake = createFakeIo(answers);
  const session = makeSession(fake, readOnly);
  await runShell({
    session,
    root: makeTree(action),
    pauseAfterActions: false,
  });
  return { fake, action, session };
}

describe("runShell", () => {
  it("walks down a tier and runs the action the operator picked", async () => {
    const { action, fake } = await drive(["1", "1", "q"]);
    expect(action).toHaveBeenCalledTimes(1);
    expect(fake.text()).toContain(`${BRAND.name} admin › Stores`);
  });

  it("goes back up a tier", async () => {
    const { fake, action } = await drive(["1", "b", "q"]);
    expect(action).not.toHaveBeenCalled();
    const lines = fake.output.filter((l) =>
      l.startsWith(`${BRAND.name} admin`),
    );
    expect(lines[lines.length - 1]).toBe(`${BRAND.name} admin`);
  });

  it("returns home from any depth", async () => {
    const { fake } = await drive(["1", "h", "q"]);
    const lines = fake.output.filter((l) =>
      l.startsWith(`${BRAND.name} admin`),
    );
    expect(lines[lines.length - 1]).toBe(`${BRAND.name} admin`);
  });

  it("redraws the menu on a bare ⏎ instead of picking something", async () => {
    const { action } = await drive(["", "", "q"]);
    expect(action).not.toHaveBeenCalled();
  });

  it("explains an unknown answer and keeps going", async () => {
    const { fake, action } = await drive(["nonsense", "q"]);
    expect(fake.text()).toContain("isn't one of these");
    expect(action).not.toHaveBeenCalled();
  });

  it("shows what each option does on ?", async () => {
    const { fake } = await drive(["1", "?", "q"]);
    expect(fake.text()).toContain("what these do");
    expect(fake.text()).toContain("Create a store  [writes]");
  });

  it("refuses a writing action in read-only mode, and says why", async () => {
    const { fake, action } = await drive(["1", "2", "q"], true);
    expect(action).not.toHaveBeenCalled();
    expect(fake.text()).toContain("was started --read-only");
  });

  it("still allows reads in read-only mode", async () => {
    const { action } = await drive(["1", "1", "q"], true);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("survives a failing action — one bad answer must not end the session", async () => {
    const failing = vi.fn(async () => {
      throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
    });
    const fake = createFakeIo(["1", "1", "1", "q"]);
    await runShell({
      session: makeSession(fake),
      root: makeTree(failing),
      pauseAfterActions: false,
    });
    expect(failing).toHaveBeenCalledTimes(2);
    expect(fake.text()).toContain("✗ Order not found");
  });

  it("ends cleanly when stdin closes mid-menu", async () => {
    const fake = createFakeIo([]);
    await expect(
      runShell({
        session: makeSession(fake),
        root: makeTree(async () => {}),
        pauseAfterActions: false,
      }),
    ).resolves.toBeUndefined();
  });

  it("ends cleanly when stdin closes inside an action's prompt", async () => {
    const asking = async () => {
      await fakeRef.io.ask("  Something?");
    };
    const fakeRef = createFakeIo(["1", "1"]);
    await expect(
      runShell({
        session: makeSession(fakeRef),
        root: makeTree(asking),
        pauseAfterActions: false,
      }),
    ).resolves.toBeUndefined();
  });

  it("pauses after an action so its output is read before the next menu", async () => {
    const fake = createFakeIo(["1", "1", "", "q"]);
    await runShell({
      session: makeSession(fake),
      root: makeTree(async () => {}),
    });
    expect(fake.text()).toContain("⏎ to continue");
  });
});

describe("describeError", () => {
  it("passes a plain message through", () => {
    expect(describeError(new Error("Stripe is not configured"))).toBe(
      "Stripe is not configured",
    );
  });

  it("turns a zod issue list into a sentence instead of raw JSON", () => {
    const zodish = new Error(
      JSON.stringify([
        {
          path: ["publicDomain"],
          message: "Enter a bare domain like shop.example.com",
        },
        { path: ["currency"], message: "Use a 3-letter currency code" },
      ]),
    );
    expect(describeError(zodish)).toBe(
      "Enter a bare domain like shop.example.com; Use a 3-letter currency code",
    );
  });

  it("copes with something that isn't an Error at all", () => {
    expect(describeError("boom")).toBe("boom");
  });
});
