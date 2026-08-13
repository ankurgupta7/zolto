/**
 * Navigation for the admin shell — pure, and the reason the menu can be
 * trusted without a terminal in the loop.
 *
 * Every keystroke the operator can type at a menu is resolved here into one of
 * a closed set of outcomes; the shell (shell.ts) does nothing but act on them.
 */

import type { MenuItem } from "./types";

export type Selection =
  | { kind: "item"; item: MenuItem }
  | { kind: "back" }
  | { kind: "home" }
  | { kind: "quit" }
  | { kind: "help" }
  | { kind: "redraw" }
  | { kind: "ambiguous"; matches: MenuItem[] }
  | { kind: "unknown"; input: string };

export const BACK_WORDS = ["b", "back", ".."];
export const HOME_WORDS = ["h", "home", "/"];
export const QUIT_WORDS = ["q", "quit", "exit"];
export const HELP_WORDS = ["?", "help"];

export function isLeaf(item: MenuItem): boolean {
  return typeof item.run === "function";
}

/**
 * Resolve what the operator typed against the menu they are looking at.
 *
 * Numbers are the primary interface (the request was "give me options and I
 * pick one"), but a name is accepted too — an operator who runs this daily
 * should be able to type "comp" instead of counting down to item 4. A prefix
 * that matches two entries is reported as ambiguous rather than guessed: these
 * options move money.
 */
export function resolveSelection(
  items: readonly MenuItem[],
  rawInput: string,
): Selection {
  const input = rawInput.trim();
  if (input === "") return { kind: "redraw" };

  const lower = input.toLowerCase();
  if (BACK_WORDS.includes(lower)) return { kind: "back" };
  if (HOME_WORDS.includes(lower)) return { kind: "home" };
  if (QUIT_WORDS.includes(lower)) return { kind: "quit" };
  if (HELP_WORDS.includes(lower)) return { kind: "help" };

  if (/^\d+$/.test(input)) {
    const index = Number.parseInt(input, 10) - 1;
    const item = items[index];
    return item ? { kind: "item", item } : { kind: "unknown", input };
  }

  // An exact key or title wins outright, so "categories" picks the category
  // tier even though several actions mention categories in their titles.
  const exact = items.find(
    (item) =>
      item.key.toLowerCase() === lower ||
      item.key.split(".").pop()?.toLowerCase() === lower ||
      item.title.toLowerCase() === lower,
  );
  if (exact) return { kind: "item", item: exact };

  const matches = items.filter(
    (item) =>
      item.title.toLowerCase().includes(lower) ||
      item.key.toLowerCase().includes(lower),
  );
  if (matches.length === 1) return { kind: "item", item: matches[0] };
  if (matches.length > 1) return { kind: "ambiguous", matches };
  return { kind: "unknown", input };
}

/** "Zolto admin › Plans & billing" — where the operator currently is. */
export function breadcrumb(path: readonly MenuItem[]): string {
  return path.map((item) => item.title).join(" › ");
}

/**
 * The menu as printed: breadcrumb, numbered options, and the always-available
 * navigation words. The store the shell is pointed at is part of the header
 * rather than a per-action reminder — it decides what half these options act
 * on, so it must be impossible to miss.
 */
export function renderMenu(
  path: readonly MenuItem[],
  opts: { storeLabel?: string | null; readOnly?: boolean } = {},
): string[] {
  const current = path[path.length - 1];
  const items = current?.children ?? [];
  const lines: string[] = ["", breadcrumb(path)];

  const context: string[] = [];
  context.push(`store: ${opts.storeLabel ?? "none selected"}`);
  if (opts.readOnly) context.push("READ-ONLY");
  lines.push(context.join("   ·   "));
  lines.push("");

  const width = String(items.length).length;
  items.forEach((item, i) => {
    const number = String(i + 1).padStart(width);
    const marker = isLeaf(item) ? " " : "›";
    lines.push(`  ${number}. ${item.title}${marker === "›" ? " ›" : ""}`);
  });

  lines.push("");
  lines.push(
    path.length > 1
      ? "  [b] back   [h] home   [?] help   [q] quit"
      : "  [?] help   [q] quit",
  );
  return lines;
}

/** The `?` screen: what each option on this menu actually does. */
export function renderHelp(path: readonly MenuItem[]): string[] {
  const current = path[path.length - 1];
  const items = current?.children ?? [];
  const lines: string[] = ["", `${breadcrumb(path)} — what these do`, ""];
  items.forEach((item, i) => {
    lines.push(`  ${i + 1}. ${item.title}${item.mutates ? "  [writes]" : ""}`);
    if (item.hint) lines.push(`     ${item.hint}`);
  });
  lines.push("");
  lines.push(
    "  Type a number, or part of an option's name. [b] back  [h] home  [q] quit.",
  );
  return lines;
}

/** Walk down into a tier; a leaf never changes the path. */
export function descend(path: readonly MenuItem[], item: MenuItem): MenuItem[] {
  return isLeaf(item) ? [...path] : [...path, item];
}

/** Walk back up. The root is a floor, never popped. */
export function ascend(path: readonly MenuItem[]): MenuItem[] {
  return path.length > 1 ? path.slice(0, -1) : [...path];
}

/** Every leaf in the tree, depth-first — used by the tests and by `find`. */
export function allActions(root: MenuItem): MenuItem[] {
  if (isLeaf(root)) return [root];
  return (root.children ?? []).flatMap(allActions);
}
