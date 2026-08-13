import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  askSuffix,
  confirmSuffix,
  createReadlineIo,
  parseConfirm,
  ShellExit,
} from "./io";

describe("parseConfirm", () => {
  it("accepts the obvious yeses and noes", () => {
    expect(parseConfirm("y", false)).toBe(true);
    expect(parseConfirm("YES", false)).toBe(true);
    expect(parseConfirm("n", true)).toBe(false);
    expect(parseConfirm("No", true)).toBe(false);
  });

  it("uses the default for a bare ⏎", () => {
    expect(parseConfirm("", true)).toBe(true);
    expect(parseConfirm("  ", false)).toBe(false);
  });

  it("never reads a typo as consent when the default is no", () => {
    expect(parseConfirm("ye", false)).toBe(false);
    expect(parseConfirm("sure", false)).toBe(false);
    expect(parseConfirm("delete it", false)).toBe(false);
  });
});

describe("prompt suffixes", () => {
  it("shows which way ⏎ falls", () => {
    expect(confirmSuffix(false)).toBe(" (y/N) ");
    expect(confirmSuffix(true)).toBe(" (Y/n) ");
  });

  it("shows a free-text default in brackets", () => {
    expect(askSuffix("chf")).toBe(" [chf] ");
    expect(askSuffix(undefined)).toBe(" ");
  });
});

/** Drive the real readline implementation over a pair of in-memory streams. */
function harness() {
  const input = new PassThrough();
  const output = new PassThrough();
  const written: string[] = [];
  output.on("data", (chunk) => written.push(String(chunk)));
  return { input, output, written, io: createReadlineIo(input, output) };
}

describe("createReadlineIo", () => {
  it("reads a trimmed answer", async () => {
    const h = harness();
    const answer = h.io.ask("Name?");
    h.input.write("  Kalakosh  \n");
    expect(await answer).toBe("Kalakosh");
    h.io.close();
  });

  it("falls back to the default on a bare ⏎", async () => {
    const h = harness();
    const answer = h.io.ask("Slug?", { default: "kalakosh" });
    h.input.write("\n");
    expect(await answer).toBe("kalakosh");
    h.io.close();
  });

  it("resolves a confirmation through parseConfirm", async () => {
    const h = harness();
    const answer = h.io.confirm("Delete?", { default: false });
    h.input.write("y\n");
    expect(await answer).toBe(true);
    h.io.close();
  });

  it("treats end of input as an exit rather than an endless empty answer", async () => {
    const h = harness();
    const answer = h.io.ask("Name?");
    h.input.end();
    await expect(answer).rejects.toBeInstanceOf(ShellExit);
  });

  it("refuses to prompt once the terminal is closed", async () => {
    const h = harness();
    h.io.close();
    await expect(h.io.ask("Name?")).rejects.toBeInstanceOf(ShellExit);
  });

  it("writes whole lines", () => {
    const h = harness();
    h.io.print("one");
    h.io.printLines(["two", "three"]);
    expect(h.written.join("")).toContain("one\ntwo\nthree\n");
    h.io.close();
  });
});
