/**
 * deploy/schemaDrift.test.ts — the deploy path must create every column the app reads.
 *
 * `update.sh` (plus the helpers it sources from `deploy/lib/db.sh`) is the
 * authoritative migration path for a real deployment — NOT `drizzle/*.sql`,
 * which only `pnpm db:push` applies and which production has never run (see
 * drizzle/README.md). Every time a schema change landed in `drizzle/schema.ts`
 * + a `drizzle/*.sql` file but nobody hand-ported it into `update.sh`, the
 * deployed database silently lacked the column until a query touching it blew
 * up in production with `ER_BAD_FIELD_ERROR`:
 *
 *   - 0008_two_tier_pricing        → orders.channel / orders.platform_fee_rappen
 *   - 0009_product_locale_it       → products.nameIt / descriptionIt
 *   - 0007_product_locales         → products.nameDe/descriptionDe/nameFr/descriptionFr
 *     ("Unknown column 'nameDe' in 'field list'" on the storefront listing)
 *
 * This test closes that loop statically: it parses the DDL out of the deploy
 * scripts and asserts it covers every table and column drizzle/schema.ts
 * declares. A new column in schema.ts with no matching statement in the deploy
 * path fails here, in CI, instead of at runtime on a live store.
 */
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { getTableConfig, MySqlTable } from "drizzle-orm/mysql-core";
import * as schema from "../drizzle/schema";

const ROOT = path.resolve(import.meta.dirname, "..");

/** Deploy scripts, with bash's backslash-escaped backticks normalised away. */
function deploySql(): string {
  return ["update.sh", "deploy/lib/db.sh"]
    .map((f) => readFileSync(path.join(ROOT, f), "utf8"))
    .join("\n")
    .replace(/\\`/g, "`");
}

/** The tables db.sh's 0019 loop adds `tenant_id` to, read from its own list. */
function tenantScopedTables(sql: string): string[] {
  const body = sql.match(/tenant_scoped_tables\(\)\s*\{([\s\S]*?)\n\}/)?.[1];
  if (!body) return [];
  return body
    .replace(/^\s*echo\s*/m, "")
    .replace(/\\\n/g, " ")
    .split(/\s+/)
    .filter((t) => /^[a-z_]+$/.test(t));
}

/**
 * table -> columns the deploy path ends up creating. Handles the three shapes
 * update.sh/db.sh actually use: CREATE TABLE bodies, ALTER TABLE ... ADD, and
 * ALTER TABLE ... DROP COLUMN (0030 drops tenants.plan_price_override).
 */
function columnsCreatedByDeploy(): Map<string, Set<string>> {
  const sql = deploySql();
  const tables = new Map<string, Set<string>>();
  const add = (table: string, column: string) => {
    if (!tables.has(table)) tables.set(table, new Set());
    tables.get(table)!.add(column);
  };

  for (const m of sql.matchAll(
    /CREATE TABLE (?:IF NOT EXISTS )?`(\w+)`\s*\(([\s\S]*?)\n\s*\);/g,
  )) {
    const [, table, body] = m;
    if (!tables.has(table)) tables.set(table, new Set());
    for (const line of body.split("\n")) {
      const col = line.match(/^\s*`(\w+)`\s+\S/);
      if (col) add(table, col[1]);
    }
  }

  for (const m of sql.matchAll(
    /ALTER TABLE `([\w${}]+)`\s+ADD\s+(?:COLUMN\s+)?`(\w+)`/g,
  )) {
    const [, table, column] = m;
    // db.sh's 0019 loop: ALTER TABLE `${tbl}` ADD `tenant_id`, over the list
    // tenant_scoped_tables() prints.
    if (table.includes("$")) {
      for (const t of tenantScopedTables(sql)) add(t, column);
    } else {
      add(table, column);
    }
  }

  for (const m of sql.matchAll(/ALTER TABLE `(\w+)`\s+DROP COLUMN `(\w+)`/g)) {
    tables.get(m[1])?.delete(m[2]);
  }

  return tables;
}

/** table -> columns drizzle/schema.ts declares (the shape the app queries). */
function columnsDeclaredInSchema(): Map<string, string[]> {
  const declared = new Map<string, string[]>();
  for (const value of Object.values(schema)) {
    if (!(value instanceof MySqlTable)) continue;
    const config = getTableConfig(value);
    declared.set(
      config.name,
      config.columns.map((c) => c.name),
    );
  }
  return declared;
}

describe("deploy path vs drizzle/schema.ts", () => {
  const deployed = columnsCreatedByDeploy();
  const declared = columnsDeclaredInSchema();

  it("parses DDL out of the deploy scripts at all", () => {
    // Guards the parser itself: if update.sh's formatting ever drifts far
    // enough that nothing matches, the coverage assertions below would pass
    // vacuously-empty in the wrong direction (they'd fail loudly) — but a
    // partial parse is the dangerous case, so pin a few known columns.
    expect(deployed.get("products")).toContain("nameEn");
    expect(deployed.get("products")).toContain("reserved_until");
    expect(deployed.get("tenants")).toContain("stripe_connected_account_id");
    expect(deployed.get("orders")).toContain("platform_fee_rappen");
    expect(deployed.get("tenants")).not.toContain("plan_price_override");
  });

  it.each([...columnsDeclaredInSchema().keys()])(
    "creates every column of `%s`",
    (table) => {
      const created = deployed.get(table);
      expect(
        created,
        `update.sh never creates table \`${table}\``,
      ).toBeDefined();
      const missing = declared.get(table)!.filter((c) => !created!.has(c));
      expect(
        missing,
        `columns in drizzle/schema.ts but never created by update.sh/db.sh: ` +
          `${table}.{${missing.join(", ")}} — port the migration into update.sh`,
      ).toEqual([]);
    },
  );
});
