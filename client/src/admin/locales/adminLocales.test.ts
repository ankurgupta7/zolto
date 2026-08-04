/**
 * Structural guard over the admin locale fragments.
 *
 * The admin namespace is assembled by shallow-spreading four fragment groups
 * (core, catalog, store, ops) per language (lib/i18n.ts). Two invariants keep
 * that safe, and both fail silently at runtime if broken — a missing key just
 * renders English (or the raw key), and a stray top-level group collides with
 * another fragment's keys:
 *
 * 1. Within a group, all four languages carry the exact same key tree, and no
 *    leaf is empty. An empty group ({} in all four languages) is fine — it is
 *    simply not written yet; an asymmetric group (translated in one language,
 *    missing in another) is not.
 * 2. A fragment nests everything under its own group name only, so the
 *    shallow spread in lib/i18n.ts can never clobber another group.
 */

import { describe, expect, it } from "vitest";

import coreDe from "./core.de.json";
import coreEn from "./core.en.json";
import coreFr from "./core.fr.json";
import coreIt from "./core.it.json";
import catalogDe from "./catalog.de.json";
import catalogEn from "./catalog.en.json";
import catalogFr from "./catalog.fr.json";
import catalogIt from "./catalog.it.json";
import storeDe from "./store.de.json";
import storeEn from "./store.en.json";
import storeFr from "./store.fr.json";
import storeIt from "./store.it.json";
import opsDe from "./ops.de.json";
import opsEn from "./ops.en.json";
import opsFr from "./ops.fr.json";
import opsIt from "./ops.it.json";

const LANGS = ["en", "de", "fr", "it"] as const;
type Lang = (typeof LANGS)[number];

type Fragment = Record<string, unknown>;

const GROUPS: Record<string, Record<Lang, Fragment>> = {
  core: { en: coreEn, de: coreDe, fr: coreFr, it: coreIt },
  catalog: { en: catalogEn, de: catalogDe, fr: catalogFr, it: catalogIt },
  store: { en: storeEn, de: storeDe, fr: storeFr, it: storeIt },
  ops: { en: opsEn, de: opsDe, fr: opsFr, it: opsIt },
};

/** Depth-first list of dot-joined paths to every leaf (non-object) value. */
function leafPaths(node: unknown, prefix = ""): string[] {
  if (node !== null && typeof node === "object" && !Array.isArray(node)) {
    return Object.entries(node as Record<string, unknown>).flatMap(
      ([key, value]) => leafPaths(value, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

/** Leaf paths whose value is not a non-blank string. */
function badLeaves(node: unknown, prefix = ""): string[] {
  if (node !== null && typeof node === "object" && !Array.isArray(node)) {
    return Object.entries(node as Record<string, unknown>).flatMap(
      ([key, value]) => badLeaves(value, prefix ? `${prefix}.${key}` : key),
    );
  }
  return typeof node === "string" && node.trim().length > 0 ? [] : [prefix];
}

describe.each(Object.keys(GROUPS))("admin locale fragment group: %s", (group) => {
  const byLang = GROUPS[group];

  it("nests everything under its own group name only", () => {
    for (const lang of LANGS) {
      const topLevel = Object.keys(byLang[lang]);
      // Either not written yet ({}), or exactly one top-level key: the group.
      expect(
        topLevel,
        `${group}.${lang}.json must contain only the "${group}" top-level key`,
      ).toEqual(topLevel.length === 0 ? [] : [group]);
    }
  });

  it("carries an identical key tree in all four languages", () => {
    const reference = leafPaths(byLang.en).sort();
    for (const lang of LANGS) {
      expect(
        leafPaths(byLang[lang]).sort(),
        `${group}.${lang}.json diverges from ${group}.en.json`,
      ).toEqual(reference);
    }
  });

  it("has no empty or non-string leaves", () => {
    for (const lang of LANGS) {
      expect(
        badLeaves(byLang[lang]),
        `${group}.${lang}.json has blank or non-string values`,
      ).toEqual([]);
    }
  });
});
