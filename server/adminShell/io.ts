/**
 * Terminal I/O for the admin shell.
 *
 * Everything the shell prints or reads goes through the `Io` interface, so the
 * navigation loop and every action can be driven by a scripted fake in tests
 * (server/adminShell/shell.test.ts) without a TTY. The readline implementation
 * is the only part of the shell that touches a real terminal.
 */

import readline from "node:readline";

export interface Io {
  /** Print one line. No argument prints a blank line. */
  print(text?: string): void;
  /** Print several lines in order. */
  printLines(lines: readonly string[]): void;
  /** Ask for free text. Returns the trimmed answer ("" if the user just hit ⏎). */
  ask(question: string, opts?: { default?: string }): Promise<string>;
  /** Ask a yes/no question. */
  confirm(question: string, opts?: { default?: boolean }): Promise<boolean>;
  /** Release the terminal. */
  close(): void;
}

/**
 * Thrown when the input stream ends (Ctrl-D, or a pipe running dry).
 *
 * A shell that reads a closed stdin gets "" forever, which turns "just hit ⏎"
 * into an infinite menu redraw — so end-of-input is an exit, not an answer.
 */
export class ShellExit extends Error {
  constructor(message = "end of input") {
    super(message);
    this.name = "ShellExit";
  }
}

/**
 * Interpret a yes/no answer.
 *
 * Deliberately strict: only an explicit yes means yes, anything else
 * unrecognised falls back to `fallback`, which every destructive prompt passes
 * as `false`. A typo must never be read as consent to delete a store's data.
 */
export function parseConfirm(answer: string, fallback: boolean): boolean {
  const normalized = answer.trim().toLowerCase();
  if (normalized === "") return fallback;
  if (["y", "yes"].includes(normalized)) return true;
  if (["n", "no"].includes(normalized)) return false;
  return fallback;
}

/** Render the "(y/N)" hint so the default is visible in the prompt itself. */
export function confirmSuffix(fallback: boolean): string {
  return fallback ? " (Y/n) " : " (y/N) ";
}

/** Render a free-text prompt, showing the default when there is one. */
export function askSuffix(defaultValue: string | undefined): string {
  return defaultValue ? ` [${defaultValue}] ` : " ";
}

export function createReadlineIo(
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): Io {
  const rl = readline.createInterface({ input, output });
  let closed = false;
  rl.on("close", () => {
    closed = true;
  });

  function question(text: string): Promise<string> {
    if (closed) return Promise.reject(new ShellExit());
    return new Promise((resolve, reject) => {
      // `question`'s callback never fires when the stream ends mid-prompt, so
      // the close event is what resolves that case — as an exit.
      const onClose = () => reject(new ShellExit());
      rl.once("close", onClose);
      rl.question(text, (answer) => {
        rl.off("close", onClose);
        resolve(answer);
      });
    });
  }

  return {
    print(text = "") {
      output.write(`${text}\n`);
    },
    printLines(lines) {
      for (const line of lines) output.write(`${line}\n`);
    },
    async ask(prompt, opts) {
      const answer = (await question(prompt + askSuffix(opts?.default))).trim();
      return answer === "" && opts?.default !== undefined
        ? opts.default
        : answer;
    },
    async confirm(prompt, opts) {
      const fallback = opts?.default ?? false;
      const answer = await question(prompt + confirmSuffix(fallback));
      return parseConfirm(answer, fallback);
    },
    close() {
      rl.close();
    },
  };
}
