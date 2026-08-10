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
 *
 * Plural keys are compared by their base name, because the set of plural
 * categories is a property of the language, not of the key: French has a
 * `many` category (used from 1,000,000) that English and German do not, so
 * `foo_many` existing only in fr.json is correct rather than drift. Each
 * language is instead checked against the categories CLDR actually defines
 * for it, via Intl.PluralRules.
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

/** i18next plural suffixes, per the CLDR categories Intl.PluralRules reports. */
const PLURAL_SUFFIXES = ["zero", "one", "two", "few", "many", "other"];

const PLURAL_RE = new RegExp(`_(${PLURAL_SUFFIXES.join("|")})$`);

/** `store.team.seatsFullNotice_many` → `store.team.seatsFullNotice`. */
function pluralBase(path: string): string {
  return path.replace(PLURAL_RE, "");
}

/** Distinct leaf paths with plural suffixes collapsed to their base key. */
function pluralAgnosticPaths(node: unknown): string[] {
  return [...new Set(leafPaths(node).map(pluralBase))].sort();
}

/** The plural categories CLDR defines for `lang` (cardinal). */
function pluralCategories(lang: Lang): Set<string> {
  const rules = new Intl.PluralRules(lang);
  // resolvedOptions().pluralCategories is the authoritative list; probing
  // sample values would miss categories like `many` that need large numbers.
  return new Set(rules.resolvedOptions().pluralCategories);
}

/** Plural base keys → the suffixes present for them in one fragment. */
function pluralFormsByBase(node: unknown): Map<string, Set<string>> {
  const byBase = new Map<string, Set<string>>();
  for (const path of leafPaths(node)) {
    const match = path.match(PLURAL_RE);
    if (!match) continue;
    const base = pluralBase(path);
    if (!byBase.has(base)) byBase.set(base, new Set());
    byBase.get(base)!.add(match[1]);
  }
  return byBase;
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

describe.each(Object.keys(GROUPS))(
  "admin locale fragment group: %s",
  (group) => {
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
      const reference = pluralAgnosticPaths(byLang.en);
      for (const lang of LANGS) {
        expect(
          pluralAgnosticPaths(byLang[lang]),
          `${group}.${lang}.json diverges from ${group}.en.json`,
        ).toEqual(reference);
      }
    });

    it("gives every plural key exactly the categories its language needs", () => {
      for (const lang of LANGS) {
        const required = pluralCategories(lang);
        for (const [base, forms] of pluralFormsByBase(byLang[lang])) {
          // Missing a category silently falls back to another form and renders
          // the wrong grammatical number; an extra one is dead weight i18next
          // will never select.
          expect(
            [...forms].sort(),
            `${group}.${lang}.json: "${base}" plural forms`,
          ).toEqual([...required].sort());
        }
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
  },
);
