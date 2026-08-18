/**
 * Shared plumbing for the shell's actions.
 */

import type { ActionContext, StoreScope } from "../types";

/**
 * Run something against the working store, asking which store when none is
 * set. Backing out of the picker leaves the action undone, and says so — an
 * operator who hits ⏎ by mistake must not be left wondering whether a plan
 * change went through.
 */
export async function withStore(
  ctx: ActionContext,
  fn: (scope: StoreScope) => Promise<void>,
): Promise<void> {
  const scope = await ctx.requireStore();
  if (!scope) {
    ctx.io.print("  No store chosen — nothing was done.");
    return;
  }
  await fn(scope);
}

/**
 * A yes/no gate in front of anything that writes, printed as a full sentence
 * naming the store. Defaults to no.
 */
export async function confirmWrite(
  ctx: ActionContext,
  sentence: string,
): Promise<boolean> {
  const ok = await ctx.io.confirm(`  ${sentence}`, { default: false });
  if (!ok) ctx.io.print("  Cancelled — nothing was written.");
  return ok;
}

/** Ask for a bounded lookback window, defaulting to the procedure's own. */
export async function askLookbackDays(
  ctx: ActionContext,
  max: number,
  fallback: number,
): Promise<number | undefined> {
  const answer = await ctx.io.ask(`  How many days back? (1–${max})`, {
    default: String(fallback),
  });
  const value = Number.parseInt(answer, 10);
  if (Number.isNaN(value)) return undefined;
  return Math.min(Math.max(value, 1), max);
}
