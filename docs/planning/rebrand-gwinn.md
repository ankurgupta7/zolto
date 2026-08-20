# Rebrand: Zolto → Gwinn

Status: **complete**. All tiers landed; see the notes under each.

## Premise

The platform is **pre-launch — no merchants, no installs, no indexed pages**.
That removes every back-compat constraint the usual rebrand carries: no dual-serving
of domains, no dual URL schemes, no legacy storage-key migration, no orphaned
Stripe metadata, no App Store identity we have to keep. The old name is deleted
outright rather than aliased.

Starting point: **3,601 occurrences of `zolto` across 466 files**, 18 paths named
after the brand, and a logo whose mark is literally the letter Z.

## The rule this rebrand adopts

> A brand name must appear **exactly once** in the codebase — in `shared/brand.ts`.
> Everything else derives from it.

The previous rebrand (Kalakosh → Zolto) was a find-and-replace, and its leftovers
are still in the tree: `KalakoshApplication.kt` declaring `class ZoltoApplication`,
a `kalakosh_lang` localStorage key, `kalakosh-logo*.png` in `client/public/`. A
sed sweep is how you get that. This one is built so the *next* rename is a
one-line edit plus a script that names every file which disagrees.

Three mechanisms, because one does not reach everywhere:

1. **`shared/brand.ts`** — the source of truth. Every identifier, URL, hostname,
   storage key, route, reverse-DNS id and wire string in TS/TSX is derived from
   it, never spelled literally.
2. **i18next `defaultVariables`** — locale JSON cannot import TS, so the ~517
   translated strings carry `{{brand}}` and i18next substitutes `BRAND.name` at
   render. This also fixes German inflection: `{{brand}}s` is correct for any
   name we pick later.
3. **`shared/brand.check.test.ts`** — the surfaces that genuinely cannot import
   TS (Gradle, xcodegen `project.yml`, `AndroidManifest.xml`, `strings.xml`,
   `Caddyfile`, `docker-compose.yml`, `Dockerfile`, `.env.example`,
   `package.json`, `client/index.html`) are *asserted* against `shared/brand.ts`
   by a test. Plus a repo-wide guard that fails if the retired name reappears.

## New values

| Field | Value |
| --- | --- |
| Name | `Gwinn` |
| Slug | `gwinn` |
| Domain | `gwinn.ch` |
| Reverse-DNS prefix | `ch.gwinn` |
| Android applicationId / iOS bundle id | `ch.gwinn.pos` |
| Apple Services ID | `ch.gwinn.web` |
| URL scheme | `gwinn://pair` |
| POS product name | `GwinnPOS` (artifacts), `Gwinn POS` (display) |
| DB / DB user | `gwinn` / `gwinn_user` |
| Docker network / app alias | `gwinn_internal` / `gwinn-app` |

## Tiers

### Tier A — brand module (foundation)
- [x] `shared/brand.ts` with every derived identifier
- [x] i18next `defaultVariables: { brand }` wired in `client/src/lib/i18n.ts`
- [x] `shared/brand.check.test.ts` — non-TS surface assertions + repo-wide guard

### Tier B — shared/ + server/
- [x] `shared/attribution.ts`: `ZOLTO_URL`/`ZOLTO_ATTRIBUTION`/`zolto*` → brand-derived
- [x] `shared/platform.ts` `name`, `shared/marketing.ts` `MARKETING_HOSTS`, routes
- [x] `shared/costOfAcceptance.ts` rate ids (`*-card`, `*-twint-qr`, `*-online-*`)
- [x] `server/`: MCP `serverInfo.name`, Stripe `META_KIND` + statement descriptor,
      `<meta name="…-tenant-slug">`, `posDownloads` asset names, SEO routes
- [x] Google Sheets mirror column `zolto_id` → `gwinn_id`
- [x] DB column `hide_zolto_badge` → **`hide_platform_credit`** (schema + migration +
      `update.sh`) — brand-neutral, so it survives the next rename untouched

### Tier C — client/
- [x] `surface.ts` hosts, storage keys (`*_theme`, `*_discount_code`,
      `*_claim_token`, `*.tour.*`, and the stale `kalakosh_lang`)
- [x] `ZoltoCredit` → `BrandCredit`, `WhyZolto` → `WhyBrand`, routes `/why-gwinn`,
      `/compare/gwinn-vs-*`
- [x] locale JSON → `{{brand}}` across de/en/fr/it (marketing + admin)

### Tier D — mobile
- [x] Android: `ch/zolto/` → `ch/gwinn/` in 4 source roots, applicationId,
      namespace, manifest scheme, `Theme.ZoltoPOS`, `Zolto.Button.*`,
      `KalakoshApplication.kt` → `GwinnApplication.kt` (fixes the stale filename)
- [x] iOS: `ios/ZoltoPOS/` tree rename, `project.yml`, bundle ids, keychain
      service, `ZoltoTheme.swift` + `zoltoInk`/`zoltoAccent`/… colour tokens

### Tier E — infra, CI, deploy, docs
- [x] `.env.example`, `docker-compose.yml`, `Caddyfile`, `Dockerfile`, `update.sh`
- [x] `.github/`, `.circleci/`, `codemagic.yaml` — artifact names, paths, schemes
- [x] `deploy/*.sh` incl. `ZOLTO_EXPECT_EMPTY_DB`
- [x] `README.md`, `SELF_HOSTING.md`, `CLAUDE.md`, `docs/`

### Tier F — assets
- [x] Redraw the mark: brush-**G** replacing brush-Z — five copies of one path
- [x] `favicon.ico`/`favicon.png`/`logo.png`/`og-image.png`, Android drawable, iOS AppIcon
- [x] `video/…-explainer-poster.svg`
- [x] Screenshot the nav lockup in both themes + `tools/screenshot/logos.html` at 16/32px

### Tier G — verify
- [x] `npx vitest run` — 4491 pass, 0 fail
- [x] `npx tsc --noEmit` — clean
- [x] `npm run lint` — 33 errors / 356 warnings, byte-identical to the pre-branch baseline
- [x] `npm run test:deploy-scripts` — 40 pass
- [x] Screenshots: `logos.html` at 32/16px both colourways, and the real nav via
      `?shell` in dark and light
- [x] Repo-wide guard green: zero occurrences of the retired name
- [ ] **Gradle + XCTest — not run here.** The project pins JDK 17 and this
      container has only 21, and there is no macOS toolchain. Both run in CI.
      Verified at source level instead: all 51 Kotlin package declarations match
      their directories, and no XML or Swift reference to a renamed type survives.

## What the rebrand found

Three defects that predated it, all of the same shape — a rename that moved a
name on one side of a pair and not the other, failing silently:

1. **The register app shipped the wrong company's logo.** `zolto_logo.png` was
   still the Kalakosh wordmark: the previous rebrand renamed the file and never
   redrew the artwork. It is on the register's main screen.
2. **The site crawler ignored merchants who asked it to stop.** `USER_AGENT`
   advertised one product token while `parseRobots` matched a different one, so
   a `Disallow` group naming the crawler never applied. Both now derive from one
   `CRAWLER_TOKEN`.
3. **Two i18n key spaces contained the brand**, so every rename silently dropped
   translated copy back to English — i18next answers a missing key with the
   fallback, not an error. The capability column and the FAQ groups are now
   keyed brand-neutrally.

Plus the `kalakosh_lang` localStorage key the i18n bootstrap was still reading
two brands later, and `KalakoshApplication.kt` declaring `class ZoltoApplication`.

## Renaming it again

1. Edit `NAME` (and `TLD` if the domain moves) in `shared/brand.ts`.
2. Add the retired slug to `RETIRED` in `shared/brand.check.test.ts`.
3. Run `npx vitest run shared/brand.check.test.ts`. It names every file that
   still disagrees, and every file still carrying the old name.
4. Redraw the mark, then `node tools/brand/render.mjs` for the bitmaps.
5. Rewrite prose. Translated copy carries `{{brand}}` and needs no edit; comments
   and English prose do, and step 3 lists them.

## Deliberately out of scope

`Kalakosh` (936 occurrences) is a **separate, real business** the platform imports
from and compares against — `server/importKalakosh.ts`, `ios/Kalakosh/`, and the
`kalakosh-logo*` assets are legitimate. Only the two Kalakosh strings that are
Zolto-era leftovers get fixed: the `kalakosh_lang` storage key and the
`KalakoshApplication.kt` filename.

The GitHub repo slug `ankurgupta7/zolto` is renamed on GitHub, not here; it is
centralised in `shared/brand.ts` as `githubRepo` and overridable via
`POS_RELEASE_REPO`, so the code follows whenever that happens.
