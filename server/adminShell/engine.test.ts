import { describe, expect, it } from "vitest";
import {
  allActions,
  ascend,
  breadcrumb,
  descend,
  isLeaf,
  renderHelp,
  renderMenu,
  resolveSelection,
} from "./engine";
import type { MenuItem } from "./types";

const noop = async () => {};

const tree: MenuItem = {
  key: "root",
  title: "Zolto admin",
  children: [
    {
      key: "stores",
      title: "Stores",
      children: [
        { key: "stores.list", title: "List every store", run: noop },
        {
          key: "stores.create",
          title: "Create a store",
          mutates: true,
          hint: "Prints the claim token.",
          run: noop,
        },
      ],
    },
    { key: "billing", title: "Plans & billing", children: [] },
  ],
};

const storesMenu = tree.children as MenuItem[];

describe("resolveSelection", () => {
  it("picks by printed number", () => {
    const result = resolveSelection(storesMenu, "2");
    expect(result).toEqual({ kind: "item", item: storesMenu[1] });
  });

  it("rejects a number outside the list instead of wrapping around", () => {
    expect(resolveSelection(storesMenu, "9")).toEqual({
      kind: "unknown",
      input: "9",
    });
  });

  it("treats an empty line as 'show me the menu again'", () => {
    expect(resolveSelection(storesMenu, "   ")).toEqual({ kind: "redraw" });
  });

  it.each([
    ["b", "back"],
    ["BACK", "back"],
    ["..", "back"],
    ["h", "home"],
    ["/", "home"],
    ["q", "quit"],
    ["exit", "quit"],
    ["?", "help"],
  ])("reads %s as %s", (input, kind) => {
    expect(resolveSelection(storesMenu, input).kind).toBe(kind);
  });

  it("matches an option by name, so a daily operator need not count", () => {
    expect(resolveSelection(storesMenu, "billing")).toEqual({
      kind: "item",
      item: storesMenu[1],
    });
  });

  it("matches the tail of a key", () => {
    const items = tree.children?.[0].children as MenuItem[];
    expect(resolveSelection(items, "create")).toEqual({
      kind: "item",
      item: items[1],
    });
  });

  it("prefers an exact title over a substring of another option", () => {
    const items: MenuItem[] = [
      { key: "a.store", title: "Store", run: noop },
      { key: "a.stores", title: "Store settings", run: noop },
    ];
    expect(resolveSelection(items, "Store")).toEqual({
      kind: "item",
      item: items[0],
    });
  });

  it("lets an exact key beat a substring of a neighbour", () => {
    const items: MenuItem[] = [
      { key: "b.comp", title: "Comp a store", run: noop },
      { key: "b.revoke", title: "Revoke a comp", run: noop },
    ];
    expect(resolveSelection(items, "comp")).toEqual({
      kind: "item",
      item: items[0],
    });
  });

  it("refuses to guess between two partial matches — these options move money", () => {
    const items: MenuItem[] = [
      { key: "b.comp", title: "Comp a store", run: noop },
      { key: "b.revoke", title: "Revoke a comp", run: noop },
    ];
    const result = resolveSelection(items, "co");
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") expect(result.matches).toHaveLength(2);
  });

  it("reports an unmatched word rather than doing something arbitrary", () => {
    expect(resolveSelection(storesMenu, "zzz")).toEqual({
      kind: "unknown",
      input: "zzz",
    });
  });
});

describe("navigation", () => {
  it("descends into a tier but never into a leaf", () => {
    const tier = storesMenu[0];
    expect(descend([tree], tier).map((i) => i.key)).toEqual(["root", "stores"]);
    const leaf = tier.children?.[0] as MenuItem;
    expect(descend([tree, tier], leaf).map((i) => i.key)).toEqual([
      "root",
      "stores",
    ]);
  });

  it("treats the root as a floor", () => {
    expect(ascend([tree]).map((i) => i.key)).toEqual(["root"]);
    expect(ascend([tree, storesMenu[0]]).map((i) => i.key)).toEqual(["root"]);
  });

  it("knows a leaf from a tier", () => {
    expect(isLeaf(storesMenu[0])).toBe(false);
    expect(isLeaf(storesMenu[0].children?.[0] as MenuItem)).toBe(true);
  });

  it("shows where you are", () => {
    expect(breadcrumb([tree, storesMenu[0]])).toBe("Zolto admin › Stores");
  });

  it("collects every action in the tree", () => {
    expect(allActions(tree).map((a) => a.key)).toEqual([
      "stores.list",
      "stores.create",
    ]);
  });
});

describe("renderMenu", () => {
  it("numbers the options and marks the tiers", () => {
    const lines = renderMenu([tree]);
    expect(lines).toContain("  1. Stores ›");
    expect(lines).toContain("  2. Plans & billing ›");
  });

  it("puts the working store in the header, because it decides what acts on what", () => {
    expect(renderMenu([tree], { storeLabel: "Kalakosh (kalakosh)" })).toContain(
      "store: Kalakosh (kalakosh)",
    );
    expect(renderMenu([tree]).join("\n")).toContain("store: none selected");
  });

  it("says so when the shell cannot write", () => {
    expect(renderMenu([tree], { readOnly: true }).join("\n")).toContain(
      "READ-ONLY",
    );
  });

  it("offers 'back' only when there is somewhere to go back to", () => {
    expect(renderMenu([tree]).join("\n")).not.toContain("[b] back");
    expect(renderMenu([tree, storesMenu[0]]).join("\n")).toContain("[b] back");
  });
});

describe("renderHelp", () => {
  const help = renderHelp([tree, storesMenu[0]]).join("\n");

  it("explains each option", () => {
    expect(help).toContain("Prints the claim token.");
  });

  it("flags the ones that write", () => {
    expect(help).toContain("Create a store  [writes]");
    expect(help).not.toContain("List every store  [writes]");
  });
});
