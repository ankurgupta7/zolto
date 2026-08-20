# Rebrand: Zolto → Gwinn

Status: in progress. Tick each tier as it lands.

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
- [ ] `shared/brand.ts` with every derived identifier
- [ ] i18next `defaultVariables: { brand }` wired in `client/src/lib/i18n.ts`
- [ ] `shared/brand.check.test.ts` — non-TS surface assertions + repo-wide guard

### Tier B — shared/ + server/
- [ ] `shared/attribution.ts`: `ZOLTO_URL`/`ZOLTO_ATTRIBUTION`/`zolto*` → brand-derived
- [ ] `shared/platform.ts` `name`, `shared/marketing.ts` `MARKETING_HOSTS`, routes
- [ ] `shared/costOfAcceptance.ts` rate ids (`*-card`, `*-twint-qr`, `*-online-*`)
- [ ] `server/`: MCP `serverInfo.name`, Stripe `META_KIND` + statement descriptor,
      `<meta name="…-tenant-slug">`, `posDownloads` asset names, SEO routes
- [ ] Google Sheets mirror column `zolto_id` → `gwinn_id`
- [ ] DB column `hide_zolto_badge` → `hide_gwinn_badge` (schema + migration + `update.sh`)

### Tier C — client/
- [ ] `surface.ts` hosts, storage keys (`*_theme`, `*_discount_code`,
      `*_claim_token`, `*.tour.*`, and the stale `kalakosh_lang`)
- [ ] `ZoltoCredit` → `BrandCredit`, `WhyZolto` → `WhyBrand`, routes `/why-gwinn`,
      `/compare/gwinn-vs-*`
- [ ] locale JSON → `{{brand}}` across de/en/fr/it (marketing + admin)

### Tier D — mobile
- [ ] Android: `ch/zolto/` → `ch/gwinn/` in 4 source roots, applicationId,
      namespace, manifest scheme, `Theme.ZoltoPOS`, `Zolto.Button.*`,
      `KalakoshApplication.kt` → `GwinnApplication.kt` (fixes the stale filename)
- [ ] iOS: `ios/ZoltoPOS/` tree rename, `project.yml`, bundle ids, keychain
      service, `ZoltoTheme.swift` + `zoltoInk`/`zoltoAccent`/… colour tokens

### Tier E — infra, CI, deploy, docs
- [ ] `.env.example`, `docker-compose.yml`, `Caddyfile`, `Dockerfile`, `update.sh`
- [ ] `.github/`, `.circleci/`, `codemagic.yaml` — artifact names, paths, schemes
- [ ] `deploy/*.sh` incl. `ZOLTO_EXPECT_EMPTY_DB`
- [ ] `README.md`, `SELF_HOSTING.md`, `CLAUDE.md`, `docs/`

### Tier F — assets
- [ ] Redraw the mark: brush-**G** replacing brush-Z in `favicon.svg`, `logo.svg`,
      and the inline `BrushMark()` in `MarketingChrome.tsx` (three copies of one path)
- [ ] `favicon.ico`/`favicon.png`/`logo.png`/`og-image.png`, Android drawable, iOS AppIcon
- [ ] `video/…-explainer-poster.svg`
- [ ] Screenshot the nav lockup in both themes + `tools/screenshot/logos.html` at 16/32px

### Tier G — verify
- [ ] `npx vitest run`, `npx tsc --noEmit`, `npm run lint`
- [ ] Gradle + XCTest suites
- [ ] Repo-wide guard green: zero occurrences of the retired name

## Deliberately out of scope

`Kalakosh` (936 occurrences) is a **separate, real business** the platform imports
from and compares against — `server/importKalakosh.ts`, `ios/Kalakosh/`, and the
`kalakosh-logo*` assets are legitimate. Only the two Kalakosh strings that are
Zolto-era leftovers get fixed: the `kalakosh_lang` storage key and the
`KalakoshApplication.kt` filename.

The GitHub repo slug `ankurgupta7/zolto` is renamed on GitHub, not here; it is
centralised in `shared/brand.ts` as `githubRepo` and overridable via
`POS_RELEASE_REPO`, so the code follows whenever that happens.
