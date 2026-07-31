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

## Commands

- `npm run test` / `npx vitest run` — run the full test suite once
- `npm run test:coverage` — run tests with v8 coverage reporting
- `npm run check` / `npx tsc --noEmit` — typecheck
- `npm run format` — prettier write
