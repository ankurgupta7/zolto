/**
 * A scripted stand-in for the terminal, used by every admin-shell test.
 *
 * Answers are consumed in order; running out raises `ShellExit`, which is
 * exactly what a closed stdin does in the real shell — so a test that forgets
 * an answer fails immediately instead of hanging. Lives outside the `.test.ts`
 * files because the engine, the session, the actions and the loop all need it.
 */

import { parseConfirm, ShellExit, type Io } from "./io";

export interface FakeIo {
  io: Io;
  /** Everything printed, one entry per line. */
  output: string[];
  /** Everything printed, as one string — convenient for `toContain`. */
  text(): string;
  /** Answers not yet consumed. */
  unused(): number;
  /** True if `close()` was called. */
  closed(): boolean;
}

export function createFakeIo(answers: readonly string[] = []): FakeIo {
  const queue = [...answers];
  const output: string[] = [];
  let wasClosed = false;

  const next = (): string => {
    if (queue.length === 0) throw new ShellExit();
    return queue.shift() as string;
  };

  const io: Io = {
    print(text = "") {
      output.push(text);
    },
    printLines(lines) {
      output.push(...lines);
    },
    async ask(question, opts) {
      output.push(question);
      const answer = next().trim();
      return answer === "" && opts?.default !== undefined
        ? opts.default
        : answer;
    },
    async confirm(question, opts) {
      output.push(question);
      return parseConfirm(next(), opts?.default ?? false);
    },
    close() {
      wasClosed = true;
    },
  };

  return {
    io,
    output,
    text: () => output.join("\n"),
    unused: () => queue.length,
    closed: () => wasClosed,
  };
}
