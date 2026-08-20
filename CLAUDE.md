# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Testing requirements

- **Every new feature or function must ship with test cases in the same change.** This applies to new server logic (`server/**`), tRPC procedures, database query helpers, and client hooks/contexts (`client/src/**`). Do not defer tests to a follow-up.
- When modifying existing behavior, update the corresponding tests rather than leaving them passing-but-stale.
- Prefer testing units in isolation (mock `./db`, `./stripe`, `./_core/*`, etc. with `vi.mock`) over hitting real external services. For Stripe webhook signature verification, use `stripe.webhooks.generateTestHeaderString` + `supertest`, not live network calls.
- tRPC routers are tested via `appRouter.createCaller(ctx)` — see `server/products.test.ts` and `server/checkout.test.ts` for the pattern.
- Client hooks/contexts are tested with `renderHook`/`act` from `@testing-library/react` under jsdom — see `client/src/contexts/CartContext.test.tsx`.
- Run `npx vitest run` before considering work done; run `npx tsc --noEmit` to confirm no type errors were introduced.
- Run `npx vitest run --coverage` periodically and keep coverage trending up, not down — a new feature landing with 0% coverage on its own code is a regression even if the overall suite passes. Pay particular attention to payment, auth, and inventory-affecting code paths, since those carry the highest risk.
- Test files live next to the code they cover, named `*.test.ts` / `*.test.tsx` (e.g. `server/stripe.ts` → `server/stripe.test.ts`).

## Authorization: picking the right tRPC procedure

Multi-tenancy makes this easy to get wrong, and it has been wrong before —
`tenant.updateSettings` shipped as `publicProcedure` under an "Admin" heading,
so anyone who could reach a store's host could rewrite its settings.

| Use                    | When                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `publicProcedure`      | Genuinely unauthenticated: storefront reads, signup. **Never for a mutation that writes tenant data.** |
| `protectedProcedure`   | Any signed-in user, tenant-independent (e.g. `claimAdmin`).                                            |
| `tenantAdminProcedure` | **The default for store-admin work.** Signed in + admin + admin _of the store being addressed_.        |
| `superadminProcedure`  | Platform-wide operations that cross tenants by design.                                                 |

The trap: `adminProcedure` only proves the caller is an admin _somewhere_.
`ctx.tenant` comes from the request host, so `adminProcedure.use(requireTenant)`
lets an admin of store A act on store B by pointing at B's subdomain. Use
`tenantAdminProcedure` instead — it adds the belongs-to-this-tenant check.

Bare `adminProcedure` is only correct when the handler scopes every read and
write through **`ctx.user.tenantId`** (the caller's own store) and never touches
`ctx.tenant`. `products.ts` and `instagram.ts` are the reference for that shape.

When adding an admin route, ship a test that an admin of a _different_ tenant is
refused — not just that an anonymous caller is. The anonymous case rarely
regresses; the cross-tenant one silently does.

## Screenshot every UI change

**Any change to rendered UI must be looked at, not just tested.** Unit tests
assert the DOM; they cannot see the render. Ship a screenshot with the change.

```bash
npx vite --config tools/screenshot/vite.config.ts &    # isolated root, port 5199
node tools/screenshot/shoot.mjs out/ "some section text"
```

This renders the real components against the real `index.css` — nothing mocked.
It exists because the full dev server needs a database, which a review sandbox
usually doesn't have.

Env vars steer it: `SHOT_URL` picks the entry (`catalog.html` is the
catalogue admin page — add `?tour=1` to keep the first-run coach marks —
and `admin.html?route=…` the settings pages, which render inside the real
storefront navbar the shell has to clear), `SHOT_LANG` the language,
`SHOT_VIEWPORT=390x844` phone width, `SHOT_CLICK="Add Product"` clicks a
control before capturing (comma-separate for a sequence: `"Next,Next"` walks a
tour along), and `SHOT_SCROLL=1400` leaves the page scrolled down that far.
With `SHOT_FULLPAGE=0` the shot is the viewport only, which is what proves an
interaction left its result on screen rather than somewhere down the page —
and, with `SHOT_SCROLL`, that sticky chrome actually stuck.

The homepage is a reel of full-viewport posts, each made of panels you swipe
sideways through, so a full-page shot of it is a 12,000px image nobody can read:
`SHOT_CHAPTER=4` and `SHOT_PANEL=12` move to one post or one slide first and
print where they landed (`SHOT_PANEL` scrolls both axes — down to the slide's
post and sideways to the slide, and reports `slide 2/4`). Pair either with
`SHOT_FULLPAGE=0`. The harness mounts pages without `MarketingShell`, so it
stands a 4rem sticky header in for the reel — a band 64px taller than production
would flatter every panel's fit. Add `?shell` to the URL to mount the real
chrome instead (tRPC is stubbed to a logged-out visitor) — the nav bar is where
the lockup and the theme switch live, so it is the only way to look at either.

The marketing surface has two themes, and a class name is identical in both:
`SHOT_THEME=light` shoots it in light mode. Every shot prints the theme it
actually painted, read back off the DOM. A theme change that has not been shot
has not been looked at, and no unit test will say so.

A first-time visitor's theme comes from their OS, not from a stored choice —
`DEFAULT_PREFERENCE` in `marketing/lib/theme.ts` is `"system"` — so a shot with
no `SHOT_THEME` is shooting one of two possible arrivals. `SHOT_OS=dark` is the
other one; Playwright defaults to light, which is the majority case in the wild.
`tools/screenshot/logos.html` stands both colourways of the brush-G lockup on
the nav bars they have to survive, at 32px and at 16px.

The raster brand assets are **generated, not hand-edited**. `tools/brand/render.mjs`
renders `tools/screenshot/marks.html` into `client/public/{logo,favicon,og-image}.*`,
the Android drawable and the iOS AppIcon, so the bitmaps cannot drift from the
vector — a previous rebrand renamed the Android drawable to match the new name
and left the _old_ brand's wordmark inside it, which then shipped on the
register's main screen. After any change to the mark:

```bash
npx vite --config tools/screenshot/vite.config.ts &   # same harness, port 5199
node tools/brand/render.mjs
```

Ten things it has already caught that every test suite passed straight
through, and which are worth checking for by eye:

- **Tailwind emitting no utilities at all.** v4 infers content paths from the
  Vite root, so `entry.css` must `@source` the real `client/src`. A page that
  renders unstyled still passes every DOM assertion.
- **Decorative absolute positioning breaking on wrap.** `SketchUnderline` spans
  its parent's full width, so underlining a heading that wraps leaves the stroke
  trailing across the column. Underline a short phrase, not a sentence.
- **Oldstyle figures in money.** Cormorant Garamond defaults to oldstyle
  numerals, which renders `CHF 0` as `CHF o` and `2,000` as `2,ooo`. Serif
  numerals showing money or stock need `lining-nums`, not just `tabular-nums`.
- **A button whose effect lands off-screen.** The catalogue header's tool row
  used to wrap into a full-screen stack on a phone, so anything it revealed
  further down the page opened where nobody could see it and read as a dead
  button. Shoot at `SHOT_VIEWPORT=390x844` with `SHOT_CLICK` and
  `SHOT_FULLPAGE=0` before trusting that a toggle "works".
- **A tour anchor hidden behind a responsive disclosure.** GuidedTour finds its
  target by selector and prefers a rendered match, so a control that a
  breakpoint hides gives it a zero-size rect and parks the spotlight in the
  page corner. Collapse such a control by _unmounting_ it, not with `hidden`,
  and let `useTourActive()` unfold it while a tour runs — the admin header does
  both. Check it with `SHOT_URL=…/catalog.html?tour=1 SHOT_CLICK="Next,Next"`.
- **A layout that only works at the viewport it was tuned to.** The homepage
  reel snapped whole chapters and was measured at 1440x900, where all six fit.
  It fit nowhere else: 0 of 6 on a phone (a chapter is ~2.8 screens at 393px),
  2 of 6 on an iPad or a 1280x800 laptop. Snap targets are now viewport-sized
  panels, and the strength is measured rather than assumed — but the lesson is
  the measuring: shoot and measure at 375, 393, 768, 1280 and 1440 before
  believing a full-viewport layout works.
- **A translucent panel used as an overlay.** The admin sidebar is a column on
  a desktop and a drawer over the page on a phone — the same `bg-muted/30` that
  reads as a tint beside content is a window through it, so the form underneath
  showed through the nav labels. Any element that changes from beside-content to
  over-content at a breakpoint needs an opaque background on the small side.
- **A grid item with auto margins silently sized to its content.** The reel's
  horizontal track is a `Container`, so it arrives with `mx-auto` — and a grid
  item with auto margins does not stretch to its column. It sized itself to its
  content instead: a 692px scroller inside a 393px post, the right-hand two
  thirds clipped by the chapter's `overflow-hidden`, with a plausible-looking
  first screen and a green test suite. Anything that must fill its grid area
  needs an explicit `w-full` — and it is worth measuring `clientWidth` against
  the viewport, not only heights.
- **A custom variant quietly beating a Tailwind one.** `tall:` (min-height) is
  registered after Tailwind's own breakpoints, so on a 1440x900 desktop both
  `tall:` and `md:` match and the _later_ rule wins — the one-inventory node kept
  its 64px phone size on a desktop, with "INVENTORY" spilling out of the ring.
  Scope the phone step to `tall:max-md:` whenever an `md:` rule sets the same
  property, and measure the element rather than trusting the class list.
- **A swipe row nested inside a swipe track.** `SqueezePlayTills` and
  `DiaryTeaser` each carried their own `snap-x overflow-x-auto` row for phones.
  Inside the reel's carousel that is a scroller in a scroller: the inner one
  eats the gesture and strands the reader mid-post. A component with a
  phone-swipe variant needs a `dense` shape that stacks or compacts instead —
  and `Landing.test.tsx` now fails if any `overflow-x-auto` appears inside a
  reel track.

`fonts loaded: NONE ⚠` in the output means the shot is showing fallback faces
and proves nothing about typography — the vendored fonts in
`client/public/fonts/` (regenerated via `tools/fonts/vendor-fonts.sh`) are
missing or the harness isn't serving them.

## Commands

- `npm run test` / `npx vitest run` — run the full test suite once
- `npm run test:coverage` — run tests with v8 coverage reporting
- `npm run check` / `npx tsc --noEmit` — typecheck
- `npm run format` — prettier write
- `node tools/screenshot/shoot.mjs <outDir> [section text…]` — visual check (see above)
