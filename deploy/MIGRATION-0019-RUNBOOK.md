# Migration 0019 (multi-tenant) — deploy runbook

Migration 0019 creates the tenant tables and adds `tenant_id` to every
tenant-scoped table. It alters the live store's payment/inventory tables, so
validate it against a **copy** before deploying. Do the steps in order.

## 1. Inspect the live DB (read-only, safe)

On the Kalakosh server, from the repo root:

```bash
bash deploy/inspect-db.sh
```

Writes nothing. Share the output. Confirm before continuing:
- **`POS_API_KEY in .env: set`** — required so tenant #1 seeds with the key the
  POS terminal uses (it authenticates purely by that key, no fallback).
- **No tenant-scoped table shows `TABLE ABSENT`** — if any do, the server is
  behind on earlier migrations; run `bash update.sh` first (0000–0018 create
  those tables) and re-inspect.
- Note the reported MySQL **version** — pass it to the dry-run image below.

## 2. Dry-run against a copy (never touches prod)

Dump prod (single DB, no `--databases`) and dry-run on any machine with Docker:

```bash
# on the server (or wherever you can reach the db container):
docker compose exec -T db mysqldump -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" \
  "$MYSQL_DATABASE" > /tmp/kalakosh-dump.sql

# match the image to the version from step 1 (e.g. mysql:8.0, mysql:8.4, mariadb:10.11):
bash deploy/dry-run-migration.sh /tmp/kalakosh-dump.sql mysql:8.0
```

The dump stays on your infrastructure. The dry-run loads it into a throwaway
container, runs the migration **twice**, and asserts: every `tenant_id` ends
NOT NULL, all rows backfilled to tenant 1, row counts unchanged, tenant #1 +
settings seeded, no duplicate seed on the second run. Share the PASS/FAIL report
(no customer data). **Delete the dump afterwards** — it contains customer PII:
`rm /tmp/kalakosh-dump.sql`.

## 3. Deploy

Only after the dry-run passes. Take a fresh backup first (`deploy/backup.sh`),
then the normal deploy applies 0019 idempotently:

```bash
bash update.sh
```

Re-run `bash deploy/inspect-db.sh` to confirm: tenant tables present, tenant #1
seeded, every `tenant_id` present + `nullable=NO`.

## Rollback

0019 is additive (new tables + new NOT NULL column). If you must revert the code
but keep the DB, the extra tables/columns are harmless to older code **except**
that older code doesn't populate `tenant_id` on insert — so don't run a
pre-0019 build against a 0019 DB. Prefer rolling forward. A full rollback is a
restore from the step-3 backup.
