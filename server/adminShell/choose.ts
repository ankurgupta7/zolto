/**
 * "Which one?" — the pick-from-a-list prompt every tier below the top uses.
 *
 * Choosing a store, a product, a user, a category and a channel are the same
 * interaction with different columns, so they are one function. The matching
 * half is pure and tested; the printing half is three lines.
 */

import { type Column, table } from "./format";
import type { Io } from "./io";

export type Match<T> =
  | { kind: "one"; row: T }
  | { kind: "many"; rows: T[] }
  | { kind: "none" };

/**
 * Resolve what the operator typed against a numbered list.
 *
 * Order matters: the printed number wins first (it is unambiguous), then an
 * exact identifier — a store's slug or a product's id — then a substring of
 * the searchable text. Two substring hits are reported back rather than
 * guessed at; some of these lists end in a delete.
 */
export function matchRow<T>(
  rows: readonly T[],
  input: string,
  searchable: (row: T) => readonly string[],
): Match<T> {
  const query = input.trim().toLowerCase();
  if (query === "") return { kind: "none" };

  if (/^\d+$/.test(query)) {
    const byPosition = rows[Number.parseInt(query, 10) - 1];
    if (byPosition) return { kind: "one", row: byPosition };
    // Fall through: a number that isn't a line number may still be an id.
  }

  const exact = rows.filter((row) =>
    searchable(row).some((field) => field.toLowerCase() === query),
  );
  if (exact.length === 1) return { kind: "one", row: exact[0] };
  if (exact.length > 1) return { kind: "many", rows: exact };

  const partial = rows.filter((row) =>
    searchable(row).some((field) => field.toLowerCase().includes(query)),
  );
  if (partial.length === 1) return { kind: "one", row: partial[0] };
  if (partial.length > 1) return { kind: "many", rows: partial };
  return { kind: "none" };
}

export interface ChooseOptions<T> {
  title: string;
  rows: readonly T[];
  columns: readonly Column<T>[];
  /** Values that identify a row exactly — id, slug, email. */
  searchable: (row: T) => readonly string[];
  /** What to say when there is nothing to choose from. */
  empty: string;
  prompt?: string;
}

/**
 * Print the list, ask, and keep asking until the answer resolves. Returns null
 * when the operator hits ⏎ to back out — every caller treats that as "never
 * mind" rather than as a default.
 */
export async function chooseFrom<T>(
  io: Io,
  options: ChooseOptions<T>,
): Promise<T | null> {
  if (options.rows.length === 0) {
    io.print(`  ${options.empty}`);
    return null;
  }

  io.print();
  io.print(options.title);
  const numbered: Column<T>[] = [
    {
      label: "#",
      align: "right",
      value: (row) => String(options.rows.indexOf(row) + 1),
    },
    ...options.columns,
  ];
  io.printLines(table(options.rows, numbered));
  io.print();

  for (;;) {
    const answer = await io.ask(
      options.prompt ?? "  Which one? (number or name, ⏎ to cancel)",
    );
    if (answer.trim() === "") return null;

    const match = matchRow(options.rows, answer, options.searchable);
    if (match.kind === "one") return match.row;
    if (match.kind === "many") {
      io.print(
        `  "${answer}" matches ${match.rows.length} of them — be more specific, or use the number.`,
      );
      continue;
    }
    io.print(`  Nothing here matches "${answer}".`);
  }
}

/** Ask for a whole number within a range, or nothing. */
export async function askInteger(
  io: Io,
  prompt: string,
  opts: { min?: number; max?: number } = {},
): Promise<number | null> {
  for (;;) {
    const answer = await io.ask(prompt);
    if (answer === "") return null;
    const value = Number.parseInt(answer, 10);
    if (!/^-?\d+$/.test(answer) || Number.isNaN(value)) {
      io.print("  That isn't a whole number.");
      continue;
    }
    if (opts.min !== undefined && value < opts.min) {
      io.print(`  Must be at least ${opts.min}.`);
      continue;
    }
    if (opts.max !== undefined && value > opts.max) {
      io.print(`  Must be at most ${opts.max}.`);
      continue;
    }
    return value;
  }
}
