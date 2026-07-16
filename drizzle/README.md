# Drizzle migrations

## What happened here (2026-07-05)

This project's migration history had drifted for a long time: `drizzle/meta/`
(drizzle-kit's own bookkeeping — the journal + per-migration snapshots) only
had entries for migrations `0000`-`0002`, while `drizzle/*.sql` had numbered
files up to `0013` (with `0010` missing entirely and two different files both
claiming `0012`). Migrations `0003` onward were added by hand — matching
naming convention, but never produced by `drizzle-kit generate` — so
`drizzle-kit` itself had no record of any schema change after `0002`.

Practically, this meant:

- `drizzle-kit generate` would diff `schema.ts` against the stale `0002`
  snapshot and try to "recreate" everything added since (`orders`,
  `bulk_upload_logs`, `pos_orders`/`pos_order_items`, the `quantity` column,
  body-part categories, `returns`, `sets` category, `stripe_reconciliations`)
  as if none of it existed yet.
- `drizzle-kit migrate` only knew about migrations `0000`-`0002`, so it never
  applied (and couldn't have applied) `0003`-`0013`. Whoever got those tables
  into the real production database did it by hand (e.g. running the `.sql`
  file directly against the database), bypassing `drizzle-kit` entirely.

The old, now-superseded `.sql` files and `meta/` snapshots are preserved for
audit purposes in [`_legacy_migrations/`](./_legacy_migrations) exactly as
they were (a stray, already-orphaned `drizzle/migrations/` folder unrelated to
this project's actual config is preserved there too, under
`orphaned_migrations_dir/`, for the same reason — it was never referenced by
`drizzle.config.ts`, which has always pointed `out` at `./drizzle`).

**The fix:** `drizzle/meta/` was reset and `drizzle-kit generate` was run for
real (not hand-edited) against the current `schema.ts`, producing a single
new baseline migration, `0000_baseline_2026_07_05.sql`, whose snapshot
(`meta/0000_snapshot.json`) accurately reflects the schema as of this commit.
From here on, `pnpm db:push` (`drizzle-kit generate && drizzle-kit migrate`)
will diff against the truth again.

## What this means for you

### Setting up a brand-new database (fresh dev environment, new self-hosted install)

Nothing special — just run `pnpm db:push` as documented in the main README.
It will apply `0000_baseline_2026_07_05.sql` (which creates every table from
scratch) and, from then on, behave exactly as drizzle-kit intends.

### The existing production database (already has all these tables)

**Do not run `pnpm db:push` (or `drizzle-kit migrate`) against it yet.**
`drizzle-kit`'s migration runner only tracks *the single most recently
applied migration's timestamp* in a `__drizzle_migrations` table — it does
not check whether individual tables already exist. Since the new baseline's
timestamp is newer than anything already recorded there, `drizzle-kit
migrate` would try to execute the full `CREATE TABLE ...` baseline against a
database that already has those tables, and fail (or worse, partially apply).

Before ever running `pnpm db:push` against production again, stamp the new
baseline as already-applied so drizzle-kit considers it done without
executing it:

```sql
-- Run this once, directly against the production database, BEFORE the next
-- `pnpm db:push`. Creates drizzle-kit's bookkeeping table if it doesn't
-- already exist, then records the new baseline as applied.
CREATE TABLE IF NOT EXISTS `__drizzle_migrations` (
  `id` serial PRIMARY KEY,
  `hash` text NOT NULL,
  `created_at` bigint
);

INSERT INTO `__drizzle_migrations` (`hash`, `created_at`)
VALUES (
  '0a82f53795fbda1ccd8e2a67dddb4a35788a6aab6be5d45b87958211df6beaa4',
  1783258410631
);
```

The `hash` is the sha256 of `0000_baseline_2026_07_05.sql`'s exact contents
and the `created_at` is that migration's journal timestamp
(`drizzle/meta/_journal.json` → `entries[0].when`) — both are fixed values
tied to this specific file, not something to regenerate. **If this baseline
file is ever edited (including by an auto-formatter), this hash goes stale
and must be recomputed** with:

```bash
node -e "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync('drizzle/0000_baseline_2026_07_05.sql')).digest('hex'))"
```

After stamping, `pnpm db:push` will see the baseline as already applied and
only run genuinely new migrations from here on — the same way it always
should have.

### Double check before stamping

Only run the stamp SQL if your production schema actually matches
`drizzle/schema.ts` as of this commit (i.e. it already has every table this
baseline creates — `stripe_reconciliations` included). If you're not sure,
compare `SHOW TABLES;` / `DESCRIBE <table>;` output against
`0000_baseline_2026_07_05.sql` first.
