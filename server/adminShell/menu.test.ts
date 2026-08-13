import { describe, expect, it } from "vitest";
import { allActions, isLeaf } from "./engine";
import { menu } from "./menu";
import type { MenuItem } from "./types";

function walk(item: MenuItem, path: string[] = []): [MenuItem, string[]][] {
  const here: [MenuItem, string[]][] = [[item, path]];
  for (const child of item.children ?? []) {
    here.push(...walk(child, [...path, item.key]));
  }
  return here;
}

const everyNode = walk(menu);

describe("menu shape", () => {
  it("is a tree of tiers ending in actions — never both, never neither", () => {
    for (const [node] of everyNode) {
      const hasChildren = (node.children?.length ?? 0) > 0;
      expect(
        hasChildren !== isLeaf(node),
        `${node.key} must be either a tier with children or an action with run()`,
      ).toBe(true);
    }
  });

  it("gives every node a unique key, so a shortcut can never be ambiguous", () => {
    const keys = everyNode.map(([node]) => node.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("titles every node", () => {
    for (const [node] of everyNode) {
      expect(node.title.trim().length, node.key).toBeGreaterThan(0);
    }
  });

  it("explains every tier, since that is what the operator chooses between first", () => {
    for (const [node] of everyNode) {
      if (node.key !== "root" && !isLeaf(node)) {
        expect(node.hint, `${node.key} needs a hint`).toBeTruthy();
      }
    }
  });

  it("goes at most four levels deep — a menu, not a maze", () => {
    const deepest = Math.max(...everyNode.map(([, path]) => path.length));
    expect(deepest).toBeLessThanOrEqual(3);
  });
});

describe("top tier", () => {
  it("is organised by what the operator is thinking about", () => {
    expect(menu.children?.map((c) => c.key)).toEqual([
      "stores",
      "billing",
      "people",
      "catalogue",
      "orders",
      "setup",
      "platform",
    ]);
  });
});

describe("coverage of the admin surface", () => {
  const keys = allActions(menu).map((a) => a.key);

  it.each([
    // Stores
    "stores.list",
    "stores.inspect",
    "stores.create",
    // Money
    "billing.overview",
    "billing.setPlan",
    "billing.comp",
    "billing.revokeComp",
    // Access
    "people.setRole",
    "people.invite",
    "people.removeStaff",
    // Stock
    "catalogue.list",
    "catalogue.quantity",
    "categories.rename",
    // Sales
    "orders.recent",
    "orders.refulfil",
    "orders.reconcileStripe",
    // Setup
    "setup.editSetting",
    "setup.rotatePosKey",
    "setup.setChannelSecret",
    // Platform
    "platform.metrics",
    "platform.reconcileAll",
    "platform.posTestKey",
  ])("offers %s", (key) => {
    expect(keys).toContain(key);
  });
});

describe("write flags", () => {
  /**
   * Every action that writes MUST carry `mutates`, or --read-only silently
   * stops meaning anything. Listed explicitly rather than derived, so adding a
   * mutation without flagging it fails here instead of in production.
   */
  const EXPECTED_WRITES = [
    "stores.create",
    "billing.setPlan",
    "billing.comp",
    "billing.revokeComp",
    "people.setRole",
    "people.invite",
    "people.revokeInvite",
    "people.removeStaff",
    "catalogue.visibility",
    "catalogue.sold",
    "catalogue.quantity",
    "catalogue.delete",
    "catalogue.duplicates",
    "categories.add",
    "categories.rename",
    "categories.delete",
    "categories.reorder",
    "categories.preset",
    "orders.refulfil",
    "orders.reconcileStripe",
    "orders.reconcilePos",
    "setup.editSetting",
    "setup.rotatePosKey",
    "setup.pairRegister",
    "setup.setChannelSecret",
    "setup.deleteChannelSecret",
    "platform.reconcileAll",
    "platform.posTestKey",
  ];

  it("flags exactly the actions that write", () => {
    const flagged = allActions(menu)
      .filter((a) => a.mutates)
      .map((a) => a.key)
      .sort();
    expect(flagged).toEqual([...EXPECTED_WRITES].sort());
  });

  it("leaves the read-only actions unflagged, so --read-only stays usable", () => {
    const reads = allActions(menu).filter((a) => !a.mutates);
    expect(reads.length).toBeGreaterThan(10);
    expect(reads.map((a) => a.key)).toContain("platform.metrics");
  });
});
