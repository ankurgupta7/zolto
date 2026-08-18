/**
 * The shell's state: who is operating it, which store it is pointed at, and
 * how it reaches the application.
 *
 * The database and tRPC dependencies arrive as functions rather than imports
 * so the whole session — including the "pick a store" flow every store-scoped
 * action leans on — can be exercised against fakes.
 */

import type { Tenant, User } from "../../drizzle/schema";
import type { AdminCaller } from "./caller";
import { createCallerFor } from "./caller";
import { chooseFrom } from "./choose";
import { getTenantById, listTenantsForOperator } from "../db";
import { orDash, planLabel, shortDate, yesNo } from "./format";
import type { Io } from "./io";
import type { ActionContext, StoreScope } from "./types";

/** The columns of a store the picker needs; a subset of OperatorTenantRow. */
export interface StoreChoice {
  id: number;
  slug: string;
  name: string;
  plan: string;
  comp?: { plan?: string | null; feeWaived?: boolean | null } | null;
  stripeConnected?: boolean;
  createdAt?: Date | null;
}

export interface SessionDeps {
  listStores(): Promise<StoreChoice[]>;
  loadStore(id: number): Promise<Tenant | null>;
  callerFor(tenant: Tenant | null): AdminCaller;
}

export function defaultSessionDeps(operator: User): SessionDeps {
  return {
    listStores: () => listTenantsForOperator(),
    loadStore: async (id) => (await getTenantById(id)) ?? null,
    callerFor: (tenant) => createCallerFor(operator, tenant),
  };
}

export class ShellSession implements ActionContext {
  readonly io: Io;
  readonly operator: User;
  readonly readOnly: boolean;
  readonly platform: AdminCaller;

  private store: Tenant | null = null;
  private readonly deps: SessionDeps;

  constructor(opts: {
    io: Io;
    operator: User;
    readOnly: boolean;
    deps: SessionDeps;
  }) {
    this.io = opts.io;
    this.operator = opts.operator;
    this.readOnly = opts.readOnly;
    this.deps = opts.deps;
    this.platform = opts.deps.callerFor(null);
  }

  currentStore(): Tenant | null {
    return this.store;
  }

  setStore(tenant: Tenant | null): void {
    this.store = tenant;
  }

  /** "Kalakosh (kalakosh)" — what the menu header shows. */
  storeLabel(): string | null {
    return this.store ? `${this.store.name} (${this.store.slug})` : null;
  }

  async requireStore(): Promise<StoreScope | null> {
    if (this.store) {
      // Re-read rather than reuse: plan, comp and Stripe-connection columns
      // are what the procedures gate on, and any of them may have been
      // changed a menu ago — by this shell or by the merchant.
      const fresh = await this.deps.loadStore(this.store.id);
      if (fresh) {
        this.store = fresh;
        return { tenant: fresh, caller: this.deps.callerFor(fresh) };
      }
      this.io.print(
        `  The store previously selected (id ${this.store.id}) no longer exists.`,
      );
      this.store = null;
    }

    const picked = await this.pickStore();
    if (!picked) return null;
    this.store = picked;
    this.io.print(`  Working store is now ${picked.name} (${picked.slug}).`);
    return { tenant: picked, caller: this.deps.callerFor(picked) };
  }

  /** The store picker, also reachable directly from the Stores menu. */
  async pickStore(): Promise<Tenant | null> {
    const stores = await this.deps.listStores();
    const choice = await chooseFrom(this.io, {
      title: "  Stores",
      rows: stores,
      empty: "There are no stores on this platform yet.",
      searchable: (row) => [String(row.id), row.slug, row.name],
      columns: [
        { label: "id", align: "right", value: (r) => String(r.id) },
        { label: "slug", value: (r) => r.slug },
        { label: "name", value: (r) => r.name },
        { label: "plan", value: (r) => planLabel(r) },
        { label: "stripe", value: (r) => yesNo(r.stripeConnected) },
        { label: "created", value: (r) => shortDate(r.createdAt ?? null) },
      ],
      prompt: "  Which store? (number, slug or id — ⏎ to cancel)",
    });
    if (!choice) return null;

    const tenant = await this.deps.loadStore(choice.id);
    if (!tenant) {
      this.io.print(`  Could not load store ${orDash(choice.slug)}.`);
      return null;
    }
    return tenant;
  }
}
