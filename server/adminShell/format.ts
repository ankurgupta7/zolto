/**
 * Pure rendering helpers for the admin shell.
 *
 * Nothing here touches I/O — every function returns strings, so what the
 * operator sees is testable without a terminal. Keeping the money and date
 * rules in one place also stops each action from inventing its own: a plan
 * price, an order total and a platform metric all read the same way.
 */

export interface Column<T> {
  label: string;
  /** The cell text for one row. Return "" for nothing rather than null. */
  value: (row: T) => string;
  /** Numbers read better right-aligned; text does not. */
  align?: "left" | "right";
}

const MISSING = "—";

/** A value that may be absent, rendered as an em dash rather than "null". */
export function orDash(value: unknown): string {
  if (value === null || value === undefined || value === "") return MISSING;
  return String(value);
}

export function yesNo(value: unknown): string {
  return value ? "yes" : "no";
}

/** YYYY-MM-DD — the only date shape used anywhere in the shell. */
export function shortDate(value: Date | string | null | undefined): string {
  if (!value) return MISSING;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return MISSING;
  return date.toISOString().slice(0, 10);
}

/** YYYY-MM-DD HH:MM (UTC) — for anything where the time of day matters. */
export function timestamp(value: Date | string | null | undefined): string {
  if (!value) return MISSING;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return MISSING;
  return `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 16)}Z`;
}

/**
 * Money held in the smallest unit (Stripe's shape, and `orders.amountTotal`).
 * Always two decimals — a total that renders as "CHF 12.5" reads as a bug.
 */
export function fromMinorUnits(
  amount: number | null | undefined,
  currency = "chf",
): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return MISSING;
  }
  return `${currency.toUpperCase()} ${(amount / 100).toFixed(2)}`;
}

/** Money already expressed in whole currency units (plan prices, GMV). */
export function money(
  amount: number | null | undefined,
  currency = "chf",
): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return MISSING;
  }
  return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
}

export function truncate(text: string, max: number): string {
  if (max <= 1) return text.slice(0, Math.max(0, max));
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * A fixed-width table with a rule under the header.
 *
 * Columns are sized to their widest cell, so a list of two stores doesn't get
 * the column widths of a list of two hundred.
 */
export function table<T>(rows: readonly T[], columns: readonly Column<T>[]) {
  if (columns.length === 0) return [];
  const cells = rows.map((row) => columns.map((c) => c.value(row)));
  const widths = columns.map((column, i) =>
    Math.max(column.label.length, ...cells.map((row) => row[i].length), 1),
  );

  const pad = (text: string, width: number, align: Column<T>["align"]) =>
    align === "right" ? text.padStart(width) : text.padEnd(width);

  const header = columns
    .map((c, i) => pad(c.label, widths[i], c.align))
    .join("  ")
    .trimEnd();
  const rule = widths.map((w) => "─".repeat(w)).join("  ");
  const body = cells.map((row) =>
    row
      .map((cell, i) => pad(cell, widths[i], columns[i].align))
      .join("  ")
      .trimEnd(),
  );

  return [header, rule, ...body];
}

/** Aligned `label : value` lines, for showing one record rather than a list. */
export function keyValues(
  pairs: readonly (readonly [string, string])[],
): string[] {
  if (pairs.length === 0) return [];
  const width = Math.max(...pairs.map(([label]) => label.length));
  return pairs.map(([label, value]) => `  ${label.padEnd(width)}  ${value}`);
}

/**
 * Last-resort renderer for a payload whose exact shape the shell does not
 * model — the insights summary, a reconciliation report. Flattens nested
 * objects to dotted paths so nothing is hidden behind "[object Object]".
 */
export function describe(value: unknown, prefix = ""): string[] {
  if (value === null || value === undefined) {
    return [`  ${prefix || "value"}: ${MISSING}`];
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return [`  ${prefix}: (none)`];
    return value.flatMap((item, i) =>
      typeof item === "object" && item !== null
        ? describe(item, `${prefix}[${i}]`)
        : [`  ${prefix}[${i}]: ${String(item)}`],
    );
  }
  if (value instanceof Date) return [`  ${prefix}: ${timestamp(value)}`];
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      describe(v, prefix ? `${prefix}.${k}` : k),
    );
  }
  return [`  ${prefix}: ${String(value)}`];
}

export function heading(text: string): string[] {
  return ["", text, "─".repeat(text.length)];
}

/**
 * How a store's plan actually stands: what it pays for, and what it was given.
 * A store on Free with a Pro comp reads "free (comped: pro)" rather than
 * "free", which is the distinction shared/entitlements.ts exists to preserve.
 */
export function planLabel(row: {
  plan: string;
  comp?: {
    plan?: string | null;
    feeWaived?: boolean | null;
  } | null;
}): string {
  const grants: string[] = [];
  if (row.comp?.plan) grants.push(`comped: ${row.comp.plan}`);
  if (row.comp?.feeWaived) grants.push("fee waived");
  return grants.length > 0 ? `${row.plan} (${grants.join(", ")})` : row.plan;
}
