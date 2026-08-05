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

Four env vars steer it: `SHOT_URL` picks the entry (`catalog.html` is the
catalogue admin page, `admin.html?route=…` the settings pages), `SHOT_LANG`
the language, `SHOT_VIEWPORT=390x844` phone width, and `SHOT_CLICK="Add
Product"` clicks a control before capturing. With `SHOT_FULLPAGE=0` the shot is
the viewport only, which is what proves an interaction left its result on
screen rather than somewhere down the page.

Four things it has already caught that every test suite passed straight
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
  wraps into a full-screen stack on a phone, so anything it reveals further
  down the page opens where nobody can see it and reads as a dead button.
  Shoot at `SHOT_VIEWPORT=390x844` with `SHOT_CLICK` and `SHOT_FULLPAGE=0`
  before trusting that a toggle "works".

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
