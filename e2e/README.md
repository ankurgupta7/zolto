# End-to-end (browser) smoke tests

Playwright drives a headless Chromium against the **real** app to verify the SPA
builds, loads, hydrates, and routes on the client — the layer that the
in-process `supertest` smoke tests (`server/_core/app.smoke.test.ts`) can't
observe.

## Run

```bash
npm run test:e2e
```

Playwright starts the app itself (see `webServer` in `playwright.config.ts`):
it boots `server/_core/index.ts` in dev mode on port `3100`, so no separate
build step is needed. Override the port/URL with `E2E_PORT` / `E2E_BASE_URL`.

## Suites

- **`smoke.spec.ts`** — the DB-free storefront shell: landing hydration, nav,
  client-side routing, and the SEO/agent discovery routes. Always runs.
- **`storefront.spec.ts`** — the data-driven purchase journey (shop list →
  product modal → add to bag → checkout → payment panel). **Opt-in**, skipped by
  default because it needs a seeded database.

## Database & the storefront journey

`smoke.spec.ts` renders the marketing/storefront shell without a database, so it
passes with or without `DATABASE_URL`.

`storefront.spec.ts` is skipped unless you enable it and point it at a seeded
tenant:

```bash
E2E_STOREFRONT=1 E2E_TENANT_SLUG=<slug> npm run test:e2e
```

Requirements for it to pass:

- `DATABASE_URL` set and migrated (`npm run db:push`).
- A tenant with slug `<slug>` that has at least one **visible, in-stock,
  photographed** product (storefront reads require a non-null image URL).
- To also exercise the real Stripe redirect, configure the tenant's Stripe
  (Connect) test credentials and add `E2E_STRIPE=1`.

On localhost the client resolves the storefront surface and tenant from the
query string (`?surface=storefront&tenant=<slug>`) and forwards it to the API as
the `x-tenant-slug` header (see `client/src/lib/surface.ts` + `main.tsx`), so no
subdomain or hosts-file setup is needed.

## Browser binary

`npm run test:e2e` needs a Chromium build:

- **Standard CI:** run `npx playwright install chromium` once; Playwright then
  resolves its own matching build.
- **Preinstalled Chromium** (e.g. this managed environment): the config finds a
  `chromium-*` build under `PLAYWRIGHT_BROWSERS_PATH` automatically. Set
  `PLAYWRIGHT_CHROMIUM_PATH` to point at a specific binary if needed.
