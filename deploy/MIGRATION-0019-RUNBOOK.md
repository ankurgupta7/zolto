# Migration 0019 (multi-tenant) — runbook

Migration 0019 creates the tenant tables, seeds tenant #1 (a neutral **platform**
tenant by default), and adds `tenant_id` to every tenant-scoped table.

There are two situations. Pick the one that matches your deployment.

---

## Case A — fresh, standalone Zolto (recommended first)

Zolto runs on its **own** server + **own** (empty or near-empty) database, onboarding
new stores via self-serve signup. The live Kalakosh store stays on its own separate
deployment and is **not** touched.

Here 0019 has almost nothing to back-fill (the tenant-scoped tables are empty on a
fresh install), so there's no data risk. Just deploy normally:

```bash
# on the Zolto server, in the Zolto repo, with .env configured:
bash update.sh
```

`update.sh` applies migrations 0000–0019 in order. 0019 creates the tenant tables
and seeds tenant #1 as `platform` / "Zolto Platform" (override with
`SEED_TENANT_SLUG` / `SEED_TENANT_NAME` in `.env` if you want a different system
tenant). Verify:

```bash
bash deploy/inspect-db.sh
```

Expect: tenant tables present, tenant #1 seeded, every `tenant_id` present with
`nullable=NO`. Then create a real store through the signup flow and exercise it.

> Do **not** run this against the live Kalakosh database — that's Case B, and it's
> coupled to also replacing the Kalakosh code. See below.

---

## Case B — cutover: import an existing live store as tenant #1

Only when you're deliberately moving a live store (e.g. Kalakosh) onto Zolto. This
migrates that store's real payment/inventory data, so **validate against a copy
first** and treat it as a coordinated cutover (code + DB together, maintenance
window, backup). The Zolto server code must be deployed at the same time — a
pre-0019 build cannot run against a 0019 database (its inserts omit `tenant_id`).

Set the seed identity to the store being imported, and set `POS_API_KEY` to that
store's existing key so its POS terminal keeps working (it authenticates purely by
that key, no fallback):

```bash
# in .env on the cutover target:
SEED_TENANT_SLUG=kalakosh
SEED_TENANT_NAME="Kalakosh Zürich"
POS_API_KEY=<the store's existing POS key>
```

### B.1 Inspect the source DB (read-only)

```bash
bash deploy/inspect-db.sh
```

Confirm `POS_API_KEY: set`, no tenant-scoped table shows `TABLE ABSENT`, and note
the MySQL version for the dry-run image.

### B.2 Dry-run against a copy (never touches prod)

```bash
docker compose exec -T db mysqldump -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" \
  "$MYSQL_DATABASE" > /tmp/store-dump.sql
bash deploy/dry-run-migration.sh /tmp/store-dump.sql mysql:8.0   # match the version
rm /tmp/store-dump.sql   # contains customer PII
```

The dry-run loads the dump into a throwaway container, runs 0019 twice, and asserts
every `tenant_id` ends NOT NULL, all rows backfill to tenant 1, row counts are
unchanged, tenant #1 + settings are seeded, and the second run adds nothing.

### B.3 Cutover

Only after the dry-run passes: back up (`deploy/backup.sh`), deploy the Zolto code

- run `bash update.sh` in your window, then re-run `deploy/inspect-db.sh` to confirm.

---

## Rollback

0019 is additive (new tables + a new NOT NULL column). To revert, restore from the
pre-migration backup. Do not run a pre-0019 build against a 0019 DB — prefer rolling
forward.
