/**
 * A stand-in ActionContext for the action tests: a scripted terminal, a stub
 * tRPC caller, and a working store that is already chosen (or deliberately
 * not, to exercise the "no store" path).
 *
 * Imported only by tests — the real context is ShellSession.
 */

import type { Tenant, User } from "../../drizzle/schema";
import type { AdminCaller } from "./caller";
import { createFakeIo, type FakeIo } from "./fakeIo";
import type { ActionContext, StoreScope } from "./types";

export const fakeOperator = {
  id: 1,
  tenantId: 1,
  openId: "google:1",
  email: "owner@zolto.ch",
  name: "Platform Owner",
  role: "superadmin",
  loginMethod: "google",
} as unknown as User;

export const fakeTenant = {
  id: 42,
  slug: "kalakosh",
  name: "Kalakosh",
  plan: "free",
  compPlan: null,
  compFeeWaived: false,
  compNote: null,
  stripeConnectedAccountId: null,
} as unknown as Tenant;

export interface FakeContext {
  ctx: ActionContext;
  fake: FakeIo;
  /** Stores the action pointed the shell at, in order. */
  selected: (Tenant | null)[];
}

export function createFakeContext(opts: {
  answers?: readonly string[];
  /** null means the operator has no store and backs out of the picker. */
  tenant?: Tenant | null;
  /** Partial stub of the procedures the action under test calls. */
  caller?: unknown;
  /** Partial stub for the platform-scoped caller, if it differs. */
  platform?: unknown;
  readOnly?: boolean;
  operator?: User;
}): FakeContext {
  const fake = createFakeIo(opts.answers ?? []);
  const selected: (Tenant | null)[] = [];
  let tenant = opts.tenant === undefined ? fakeTenant : opts.tenant;

  const storeCaller = (opts.caller ?? {}) as AdminCaller;
  const platformCaller = (opts.platform ?? opts.caller ?? {}) as AdminCaller;

  const ctx: ActionContext = {
    io: fake.io,
    operator: opts.operator ?? fakeOperator,
    readOnly: opts.readOnly ?? false,
    platform: platformCaller,
    currentStore: () => tenant,
    setStore(next) {
      tenant = next;
      selected.push(next);
    },
    async requireStore(): Promise<StoreScope | null> {
      return tenant ? { tenant, caller: storeCaller } : null;
    },
  };

  return { ctx, fake, selected };
}
