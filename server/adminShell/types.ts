/**
 * The shape of the admin shell's menu tree and of what an action is handed
 * when the operator picks it.
 *
 * Kept apart from both the menu (which is data) and the session (which holds
 * the database connection) so the navigation engine can be tested against a
 * toy tree with no tRPC caller anywhere in sight.
 */

import type { Tenant, User } from "../../drizzle/schema";
import type { AdminCaller } from "./caller";
import type { Io } from "./io";

/** A store the shell is currently pointed at, plus a caller scoped to it. */
export interface StoreScope {
  tenant: Tenant;
  caller: AdminCaller;
}

export interface ActionContext {
  io: Io;
  /** The superadmin whose authority every call is made with. */
  operator: User;
  /** True when the shell was started with --read-only: mutations are refused. */
  readOnly: boolean;
  /** A caller with no store scope — for the platform-wide procedures. */
  platform: AdminCaller;
  /** The working store, if one has been chosen. */
  currentStore(): Tenant | null;
  /**
   * The working store, asking the operator to pick one when none is set.
   *
   * Re-reads the tenant row on every call, so an action that runs after a plan
   * change or a comp sees the store as it is now rather than as it was when it
   * was first selected — `ctx.tenant` is what the entitlement gates read.
   *
   * Returns null when the operator backs out of the picker.
   */
  requireStore(): Promise<StoreScope | null>;
  /** Point the shell at a store (or at none). */
  setStore(tenant: Tenant | null): void;
}

/**
 * One line of a menu. A node with `children` is a tier; a node with `run` is
 * an action. Never both — `assertMenuShape` (menu.test.ts) enforces it.
 */
export interface MenuItem {
  /** Stable identifier, e.g. "stores.list". Also typeable as a shortcut. */
  key: string;
  title: string;
  /** One line under the title, shown by `?`. */
  hint?: string;
  /**
   * Marks an action that writes. The shell refuses these in --read-only mode,
   * which is the default posture of every other operator script in deploy/.
   */
  mutates?: boolean;
  children?: MenuItem[];
  run?: (ctx: ActionContext) => Promise<void>;
}
