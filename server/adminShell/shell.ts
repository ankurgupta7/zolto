/**
 * The loop: draw a menu, read a choice, descend or act, repeat.
 *
 * It owns the three things every action would otherwise have to repeat — the
 * read-only guard, catching a failed call so one bad answer doesn't end the
 * session, and the "press ⏎ to continue" beat that keeps output from scrolling
 * away under the next menu.
 */

import {
  ascend,
  descend,
  isLeaf,
  renderHelp,
  renderMenu,
  resolveSelection,
} from "./engine";
import { ShellExit } from "./io";
import type { ShellSession } from "./session";
import type { MenuItem } from "./types";

export interface RunShellOptions {
  session: ShellSession;
  root: MenuItem;
  /** Skip the "press ⏎" pause — the tests do, so they can't deadlock. */
  pauseAfterActions?: boolean;
}

/** Turn whatever a procedure threw into one line an operator can act on. */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    // tRPC wraps zod failures; the JSON issue list is unreadable at a prompt,
    // so show the messages and drop the paths.
    try {
      const parsed = JSON.parse(error.message);
      if (Array.isArray(parsed)) {
        return parsed
          .map((issue) => issue?.message ?? JSON.stringify(issue))
          .join("; ");
      }
    } catch {
      // not JSON — the message is already the useful thing
    }
    return error.message;
  }
  return String(error);
}

export async function runShell(opts: RunShellOptions): Promise<void> {
  const { session, root } = opts;
  const io = session.io;
  const pause = opts.pauseAfterActions ?? true;
  let path: MenuItem[] = [root];

  for (;;) {
    io.printLines(
      renderMenu(path, {
        storeLabel: session.storeLabel(),
        readOnly: session.readOnly,
      }),
    );

    let answer: string;
    try {
      answer = await io.ask("  >");
    } catch (error) {
      if (error instanceof ShellExit) {
        io.print("");
        return;
      }
      throw error;
    }

    const items = path[path.length - 1].children ?? [];
    const selection = resolveSelection(items, answer);

    switch (selection.kind) {
      case "redraw":
        continue;
      case "quit":
        io.print("  Bye.");
        return;
      case "back":
        path = ascend(path);
        continue;
      case "home":
        path = [root];
        continue;
      case "help":
        io.printLines(renderHelp(path));
        continue;
      case "ambiguous":
        io.print(
          `  "${answer}" could mean: ${selection.matches
            .map((m) => m.title)
            .join(", ")}. Use the number.`,
        );
        continue;
      case "unknown":
        io.print(`  "${selection.input}" isn't one of these. Try a number.`);
        continue;
      case "item":
        break;
    }

    const item = selection.item;
    if (!isLeaf(item)) {
      path = descend(path, item);
      continue;
    }

    if (item.mutates && session.readOnly) {
      io.print(
        `  "${item.title}" writes, and this shell was started --read-only. ` +
          "Restart without that flag to use it.",
      );
      continue;
    }

    try {
      await item.run?.(session);
    } catch (error) {
      if (error instanceof ShellExit) {
        io.print("");
        return;
      }
      // One failed action must not end the session: an operator who mistypes a
      // Stripe session id should land back on the menu, not at a shell prompt.
      io.print("");
      io.print(`  ✗ ${describeError(error)}`);
    }

    if (pause) {
      try {
        await io.ask("\n  ⏎ to continue");
      } catch (error) {
        if (error instanceof ShellExit) {
          io.print("");
          return;
        }
        throw error;
      }
    }
  }
}
