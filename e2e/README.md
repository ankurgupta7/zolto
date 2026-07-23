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

## Database

The specs target the **marketing surface**, which renders without a database, so
the suite passes with or without `DATABASE_URL`. When a database *is*
provisioned the same server also serves the storefront, so this is the place to
add tenant/storefront journeys (product list → cart → checkout) as follow-ups.

## Browser binary

`npm run test:e2e` needs a Chromium build:

- **Standard CI:** run `npx playwright install chromium` once; Playwright then
  resolves its own matching build.
- **Preinstalled Chromium** (e.g. this managed environment): the config finds a
  `chromium-*` build under `PLAYWRIGHT_BROWSERS_PATH` automatically. Set
  `PLAYWRIGHT_CHROMIUM_PATH` to point at a specific binary if needed.
