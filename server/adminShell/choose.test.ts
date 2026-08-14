import { describe, expect, it } from "vitest";
import { askInteger, chooseFrom, matchRow } from "./choose";
import { createFakeIo } from "./fakeIo";
import { ShellExit } from "./io";

const stores = [
  { id: 3, slug: "kalakosh", name: "Kalakosh" },
  { id: 7, slug: "kala-supplies", name: "Kala Supplies" },
];
const searchable = (s: (typeof stores)[number]) => [
  String(s.id),
  s.slug,
  s.name,
];

describe("matchRow", () => {
  it("reads a number as the printed line number first", () => {
    expect(matchRow(stores, "1", searchable)).toEqual({
      kind: "one",
      row: stores[0],
    });
  });

  it("falls back to matching a number as an id when it is not a line number", () => {
    expect(matchRow(stores, "7", searchable)).toEqual({
      kind: "one",
      row: stores[1],
    });
  });

  it("matches an exact slug even when it is a prefix of another", () => {
    expect(matchRow(stores, "kalakosh", searchable)).toEqual({
      kind: "one",
      row: stores[0],
    });
  });

  it("reports rather than guesses when a substring hits two rows", () => {
    const result = matchRow(stores, "kala", searchable);
    expect(result.kind).toBe("many");
  });

  it("treats an empty answer as no choice", () => {
    expect(matchRow(stores, "  ", searchable)).toEqual({ kind: "none" });
  });

  it("says none when nothing matches", () => {
    expect(matchRow(stores, "nope", searchable)).toEqual({ kind: "none" });
  });
});

describe("chooseFrom", () => {
  const options = {
    title: "  Stores",
    rows: stores,
    empty: "There are no stores yet.",
    searchable,
    columns: [{ label: "slug", value: (s: (typeof stores)[number]) => s.slug }],
  };

  it("returns the chosen row", async () => {
    const fake = createFakeIo(["2"]);
    expect(await chooseFrom(fake.io, options)).toBe(stores[1]);
  });

  it("returns null when the operator backs out", async () => {
    const fake = createFakeIo([""]);
    expect(await chooseFrom(fake.io, options)).toBeNull();
  });

  it("says so and asks again on an ambiguous answer", async () => {
    const fake = createFakeIo(["kala", "kalakosh"]);
    expect(await chooseFrom(fake.io, options)).toBe(stores[0]);
    expect(fake.text()).toContain("matches 2 of them");
  });

  it("asks again when nothing matches", async () => {
    const fake = createFakeIo(["zzz", "1"]);
    expect(await chooseFrom(fake.io, options)).toBe(stores[0]);
    expect(fake.text()).toContain('Nothing here matches "zzz"');
  });

  it("explains an empty list instead of prompting for a choice from nothing", async () => {
    const fake = createFakeIo([]);
    expect(await chooseFrom(fake.io, { ...options, rows: [] })).toBeNull();
    expect(fake.text()).toContain("There are no stores yet.");
  });

  it("numbers the rows it prints", async () => {
    const fake = createFakeIo(["1"]);
    await chooseFrom(fake.io, options);
    expect(fake.text()).toContain("1  kalakosh");
  });
});

describe("askInteger", () => {
  it("accepts a number in range", async () => {
    const fake = createFakeIo(["12"]);
    expect(await askInteger(fake.io, "  How many?", { min: 0 })).toBe(12);
  });

  it("returns null for a bare ⏎", async () => {
    const fake = createFakeIo([""]);
    expect(await askInteger(fake.io, "  How many?")).toBeNull();
  });

  it("re-asks on a non-number", async () => {
    const fake = createFakeIo(["lots", "3"]);
    expect(await askInteger(fake.io, "  How many?")).toBe(3);
    expect(fake.text()).toContain("isn't a whole number");
  });

  it("enforces the bounds", async () => {
    const fake = createFakeIo(["-1", "500", "50"]);
    expect(await askInteger(fake.io, "  How many?", { min: 1, max: 200 })).toBe(
      50,
    );
    expect(fake.text()).toContain("Must be at least 1.");
    expect(fake.text()).toContain("Must be at most 200.");
  });

  it("ends the session when the input stream does", async () => {
    const fake = createFakeIo([]);
    await expect(askInteger(fake.io, "  How many?")).rejects.toBeInstanceOf(
      ShellExit,
    );
  });
});
