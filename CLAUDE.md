# CLAUDE.md

> **⏳ Work in progress on branch `claude/zolto-pricing-plan-fni0pb`:** read
> [`docs/planning/CONTINUE-HERE.md`](docs/planning/CONTINUE-HERE.md) first —
> it names the one item blocking launch (verifying the Stripe Connect platform
> fee against the real API) and the decisions already settled. Delete both this
> banner and that file once it's closed.

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

## Commands

- `npm run test` / `npx vitest run` — run the full test suite once
- `npm run test:coverage` — run tests with v8 coverage reporting
- `npm run check` / `npx tsc --noEmit` — typecheck
- `npm run format` — prettier write
