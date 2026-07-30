# Continue here — handoff to the next session

> Written 2026-07-29 by the session that shipped the pricing pivot and the
> agent-commerce layer, for a successor picking this up in an environment with
> full network/DB/Stripe access.
>
> **Delete this file once the blocking item below is closed.** It is a baton,
> not documentation. The durable docs are
> [`pricing-pivot-agent-commerce.md`](./pricing-pivot-agent-commerce.md) and
> [`feature-backlog-assessment.md`](./feature-backlog-assessment.md); trust
> those over this file if they ever disagree.

Branch: **`claude/zolto-pricing-plan-fni0pb`** — all work is committed and
pushed. Nothing is stashed or uncommitted.

---

## 0a. ⛔ Connect is not configured on the deployed platform — fix this first

A live tenant (`blah1.zolto.ch`) tapped **Connect Stripe** and got *"Stripe
Connect isn't set up on the platform yet. Contact support."* That message is
**correct behaviour**, not a bug: `buildConnectAuthorizeUrl` returns null when
`STRIPE_CONNECT_CLIENT_ID` or `JWT_SECRET` is unset on the running server.

**This is bigger than the platform fee.** Until it's set, no tenant can link a
Stripe account, so **no tenant can accept online or agent payments at all** —
the whole channel the pricing model monetizes is dark. In-person POS is
unaffected (it runs on the tenant's own Terminal/TWINT path and never carried a
fee anyway). It is also why the fee tests had no properly-configured connected
account to borrow.

**Fix:** set both vars in the **deployed** `.env` and restart. The operator has
a client id (`ca_…`) already; it simply isn't on the server. Then link a real
account through the flow — that gives the integration suite a genuine account
and reproduces production exactly.

The startup log now warns when this is missing, and
`buildConnectAuthorizeUrl` logs which var is unset and which tenant hit it. The
merchant-facing message stays deliberately generic — it must not leak
deployment detail — so those logs are the operator's only signal. Nothing in
`deploy/` validates required env vars; adding that check is a worthwhile
follow-up, since this class of failure otherwise ships silently and is
discovered by a merchant.

---

## 0. The one thing blocking launch

**Run the Stripe Connect integration suite and read the answer.** Everything
else on this page is downstream of it.

```bash
pnpm install --frozen-lockfile
STRIPE_TEST_SECRET_KEY=sk_test_...  \
STRIPE_TEST_WEBHOOK_SECRET=whsec_... \
pnpm test:integration
```

The operator supplies the keys — **never commit them**; `.env` is gitignored
(`.gitignore:11`) and that is where they belong.

### Why this matters more than it looks

The Free plan's 1% is taken as a Stripe Connect `application_fee_amount` on a
direct charge. If Stripe rejects that fee, it does **not** quietly skip it —
it fails the entire `checkout.sessions.create` call. So an unverified fee path
isn't "we might not earn 1%", it's "every online sale on the Free plan might
return an error." Until this suite goes green against the real API, that
remains unknown.

The previous session could not run it: the sandbox's egress proxy denied
`api.stripe.com:443` with a 403 on CONNECT. The keys were never the problem.

### How to read the result

| Outcome | Meaning | Do next |
|---|---|---|
| **Green** | The fee works on a real direct charge. Revenue path proven end to end. | Update §9 of `pricing-pivot-agent-commerce.md` from ⚠️ to ✅, then move to §1 below. |
| **"Cannot reach the Stripe API…"** | Still a network/egress problem, *not* a Stripe rejection. | Fix connectivity and re-run. Do not interpret this as the fee being broken — that distinction is why the preflight exists. |
| **"No connected account available…"** | Test-environment gap, still not a fee rejection. | Set `STRIPE_TEST_CONNECTED_ACCOUNT_ID` to an existing test-mode `acct_...`, or link one via Zolto's own Connect OAuth flow. The suite deliberately does **not** create accounts — see below. |
| **Connect block fails some other way** | This is the finding we were looking for. | Read the Stripe error properly. Likely the platform account's Connect capabilities or the platform/connected relationship. Fix before launch — the fallback keeps sales alive but earns nothing. |

### Run history (read this before re-diagnosing)

**2026-07-29, first real run against Stripe test mode.** Four `stripe.integration.test.ts`
tests passed (statement descriptor, both shipping cases, TWINT), so the platform
account and basic connectivity are fine. But:

- **The four fee tests never ran.** The fixture called `stripe.accounts.create`
  (Accounts v1), which Stripe now rejects for new integrations, so `beforeAll`
  died and the suite skipped. **The platform fee is still unverified.** Fixed
  by borrowing an existing connected account instead of creating one — which
  also matches production, where Zolto only ever OAuth-links accounts it
  receives (`server/stripeConnect.ts`) and never creates them.
- **`billing.integration.test.ts` had 7 real failures**, all from that file
  still testing the pre-pivot world (`maker`/`studio`/`atelier`,
  `createPhotoCreditCheckoutSession`, `monthlyPhotoCredits`). It self-skips
  without a Stripe key, so it never went red during the pivot. Now rewritten
  for two tiers, and it additionally proves the legacy-price mapping
  end-to-end. Note `planForPriceId(oldMakerPrice) === "pro"` is **correct** —
  that's the grandfathering path, not a bug.

Both suites now preflight `stripe.balance.retrieve()` and fail with an explicit
"Cannot reach the Stripe API" rather than the SDK's misleading "Invalid JSON
received from the Stripe API".

**2026-07-30, second run.** `billing.integration.test.ts` is **10/10 green** —
tenant billing and the grandfathering path are now verified against the real
API. The fee tests **executed** for the first time and failed on:

> In order to use Checkout, you must set an account or business name at
> https://dashboard.stripe.com/account

**This is not a fee rejection.** The proof is in the results: the
"omits the fee entirely for Pro tenants" test carries **no**
`application_fee_amount` at all and failed with the identical error. So the
blocker is Checkout branding config on an account, not anything to do with
`application_fee_amount`.

The fixture now picks a connected account that is `charges_enabled` **and**
named (rather than the first off the list), best-effort sets a business name if
missing, and logs which account it used — because that error is a property of a
specific account and you cannot otherwise tell whether to fix the platform
account or the connected one.

**If it recurs:** set a business name on the account named in the
`[integration] platform-fee tests running on connected account acct_…` log
line, and on the platform account at
https://dashboard.stripe.com/settings/account. Then re-run. The fee itself has
still never been accepted or rejected by Stripe.

There is already a runtime safety net either way:
`createStorefrontCheckoutSession` retries once **without** the fee when — and
only when — the error is fee-specific (`isPlatformFeeRejection`), logs loudly,
and records `0` taken on the order. An un-monetized sale beats a lost one. If
the suite goes green, that path should never fire in production; if you see
that log line, the Connect relationship is misconfigured.

---

## 1. Then, in priority order

1. **Legacy subscribers.** Migration `0008` moved pre-pivot paid tenants to
   `plan = 'pro'` without touching their Stripe subscriptions, so an
   ex-Atelier tenant pays CHF 99 for the CHF 25 plan. Code handles the
   *desync*; the *money* needs a human decision per tenant. Full runbook,
   including the SQL to list them and the warning not to archive the old
   Stripe Prices while subscriptions reference them: **§8 of
   `pricing-pivot-agent-commerce.md`**. With DB access you can now actually
   run that query.
2. **Verify TWINT-via-Stripe against native 1.3%.** The last thing stopping
   "in-person is the cheapest rail" from being literally true. In-person
   currently runs on Stripe TWINT (`/api/pos/twint-intent`), fee-free from
   Zolto either way. Native TWINT means a second acquirer, reconciliation and
   payout path — verify the rate difference before committing to that.
3. **VAT: inclusive vs exclusive** (business-plan §7.1). Inherited, unresolved,
   and it now applies to Pro *and* to the platform fee. Enable Stripe Tax and
   decide before the pricing page is promoted.
4. **Storage caps.** `PLANS[].storageGb` is declared and displayed but not
   enforced at upload time. `maxProducts` *is* enforced, in `createProduct` —
   the single write choke point every intake channel shares. Do storage the
   same way, at the upload choke point, not per-caller.
5. **Rate limiter → shared store.** `server/rateLimit.ts` is the repo's first
   and its counters are in-process. That is honest for one instance and stated
   in its header comment. Move to Redis/DB **before** running more than one
   app instance, or the limit silently multiplies by instance count.
6. **Camera-first entry point.** Everything behind it exists (grounded price
   suggestion, DE/FR/IT/EN drafting, photo intake). What is missing is the UX
   surface: "open app, point at crate." Pure client work.

---

## 2. Decisions already made — please don't relitigate

Each of these was argued through. Change them if you have *new* information,
not because the reasoning isn't visible.

- **1% fee, CHF 25 Pro, exactly two tiers.** Owned by `shared/platform.ts`.
  Change the constant, not the copy — the pricing page, `/llms.txt`,
  `/llms-full.txt`, MCP `get_pricing`, the admin Billing page and checkout's
  fee maths all render from it, and `shared/platform.test.ts` holds the story
  together.
- **In-person never carries a Zolto fee, on any plan.** This is the product's
  central promise. POS lives in `pos_orders` and must stay fee-free.
- **The agent layer stays ON for Free tenants.** It is the discovery wedge,
  monetized by the skim rather than a paywall. Gating it would defeat it.
- **Agents get a payment link, never a charge.** Delegated agent payment
  (AP2/ACP-style) is nascent and a security minefield. A Stripe Checkout URL
  works with every agent that exists and keeps the trust boundary right.
- **No price suggestion without catalogue history.** A new maker is the most
  likely person to accept whatever number we show. An empty field is the
  honest answer; see `feature-backlog-assessment.md` §1.
- **No hyper-local demand intelligence yet.** With one pilot tenant we would
  be inventing the data. The failure mode is a vendor buying stock they can't
  sell on our say-so. Revisit when a market has real season-over-season sales.
- **Do not migrate to MCP 2026-07-28 yet.** We speak `2025-06-18`. The new spec
  shipped 2026-07-28 (sessions removed, `Mcp-Method`/`Mcp-Name` headers,
  `ttlMs` caching). We are already stateless and use none of the deprecated
  features, so the migration is small when it's time — but switching before
  the major clients negotiate it risks making us unreachable, which is the
  opposite of the point. **Trigger:** log the protocol version clients request;
  migrate when a real client asks for the new one. Cheap insurance meanwhile:
  echo back the client's requested version instead of hardcoding
  (`server/mcp.ts` — currently returns `MCP_PROTOCOL_VERSION` unconditionally).

---

## 3. Invariants worth not breaking

- **`shared/platform.ts` is the single source of pricing truth.** Nothing else
  should hardcode a price, a fee, or a limit.
- **`server/checkoutSession.ts` is the only checkout implementation.** The web
  cart and the agent MCP tool are two front doors onto it, differing only in
  the `channel` they record. Don't let a second one grow.
- **`orders.channel` + `orders.platform_fee_rappen`** are what make the north
  star computable. In-person is `pos_orders`. Keep the three channels cleanly
  separable or the metric dies.
- **`platform.metrics` is superadmin-only.** It is the codebase's only
  cross-tenant read; a store owner reaching it is a data leak. Tested as such.

---

## 4. Environment notes that will save you an hour

- **Use pnpm, not npm.** `pnpm@10.4.1`, lockfile is `pnpm-lock.yaml`. `npm ci`
  fails outright. Node 22.
- **`npx tsc --noEmit` emits ~6 pre-existing errors** about the `ws` module
  lacking types (`server/discord.ts`). They are on the base commit too — not
  yours. Filter them: `npx tsc --noEmit 2>&1 | grep -v "discord.ts\|@types/ws"`.
  Anything else is real.
- **Integration tests self-skip without `STRIPE_TEST_SECRET_KEY`.** With the
  key set they are included in a plain `vitest run`, so the default suite goes
  red if Stripe is unreachable. To check the code independently:
  `npx vitest run --exclude "**/*.integration.test.ts"`.
- **Last known state:** 1228 unit tests pass, typecheck clean (modulo `ws`).
- **`server/test-setup.ts` loads `.env`** into `process.env` for tests.
- Run `npx prettier --write` on touched files before committing; CI formatting
  matters and the repo is prettier-formatted throughout.
- Per `CLAUDE.md`: every new feature ships with tests in the same change, and
  tests live next to the code as `*.test.ts`.

---

## 5. What shipped on this branch (top 5 commits)

```
ad873d8 test(stripe): distinguish an unreachable Stripe API from a rejected platform fee
38b9d38 feat: platform north-star dashboard, agent store discovery, grounded pricing + Italian
37d0edd fix(billing): close out the money path — fee verification, fallback, legacy subscribers
57779ff feat(mcp): let AI agents buy directly from a merchant's own storefront
2e0b024 feat(pricing): two-tier Free/Pro model with a 1% fee on online + agent sales
```

Migrations added: `0008_two_tier_pricing.sql` (plan enum → free/pro, order
channel + fee columns), `0009_product_locale_it.sql` (Italian). Neither has
been run against a real database by the authoring session — **check
`drizzle/meta/_journal.json` against the deployed schema before assuming.**

No pull request has been opened. The operator has not asked for one.
