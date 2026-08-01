# Kalakosh Zurich — Self-Hosting Guide

This guide walks you through deploying the Kalakosh Zurich jewellery store on any Linux VPS. The entire stack runs inside Docker containers managed by Docker Compose. Caddy handles HTTPS automatically via Let's Encrypt — no manual certificate management needed.

Admin login uses **Google OAuth** — only the designated Google account (`shwena9@gmail.com` by default, configurable via `ADMIN_EMAIL`) can access the admin panel. All other visitors browse the public storefront without any account.

---

## What You Need

| Requirement    | Minimum spec                          | Recommended                            |
| -------------- | ------------------------------------- | -------------------------------------- |
| VPS            | 1 vCPU, 1 GB RAM                      | 2 vCPU, 4 GB RAM (Hetzner CX22 ~€4/mo) |
| OS             | Ubuntu 22.04 or Debian 12             | Ubuntu 24.04 LTS                       |
| Domain         | Any domain pointing to your server IP | —                                      |
| Docker         | 24+                                   | Latest stable                          |
| Docker Compose | v2 plugin                             | Latest stable                          |

---

## Architecture Overview

```
Internet
    │
    ▼
 Caddy :443 (HTTPS, auto Let's Encrypt)
    │
    ▼
 Node.js app :3000 (Express + tRPC + React)
    │          │
    │          ▼
    │       MySQL :3306 (product catalogue, users)
    │
    ▼
 S3-compatible storage (Cloudflare R2 / AWS S3 / Backblaze B2)
    │
    ▼
 LLM API (Groq / OpenAI / Ollama) — for Discord message parsing
```

The Discord bot runs as a long-lived WebSocket connection inside the Node.js process — no separate service needed.

---

## Running alongside Kalakosh-ch (served at zolto.kalakosh.ch)

If you already run the [Kalakosh-ch](https://github.com/ankurgupta7/Kalakosh-ch) stack on the same server, its Caddy already owns host ports **80** and **443**. Rather than have Zolto's Caddy fight for those ports, let the Kalakosh Caddy serve Zolto as a subdomain — **zolto.kalakosh.ch** — and reverse-proxy it to Zolto's app over a shared Docker network:

```
Internet
    │  (:443)
    ▼
 Kalakosh Caddy ──── kalakosh.ch ─────────▶ Kalakosh app :3000
        │
        └─────────── zolto.kalakosh.ch ───▶ Zolto app :3000   (via "kalakosh-shared" network)
```

In this mode Zolto runs **no Caddy of its own and binds no host ports**, so there is nothing to compete over.

**Setup:**

1. **Create the shared network** (once — safe to re-run):
   ```bash
   docker network create kalakosh-shared
   ```
2. **Add DNS:** point `zolto.kalakosh.ch` at the server IP (an `A`/`AAAA` record). The Kalakosh-ch repo already carries the matching `zolto.kalakosh.ch` block in its `Caddyfile`, so Caddy will provision the TLS certificate automatically.
3. **Set** `PUBLIC_BASE_URL=https://zolto.kalakosh.ch` in Zolto's `.env` (used for Stripe redirects and absolute URLs).
4. **Start Zolto** — the bundled Caddy is behind the `standalone` profile, so a plain up brings only the app + db, attached to the shared network:
   ```bash
   docker compose up -d
   ```
5. **Restart the Kalakosh stack** (or `docker compose up -d` it) so its Caddy picks up the shared network and the `zolto.kalakosh.ch` route.

Both stacks are independent — separate databases, separate deploys — they only share the reverse-proxy network.

**Tenant subdomains in this mode:** Zolto's own bundled Caddyfile isn't used here, so its `*.{$SITE_DOMAIN}` block doesn't apply — tenant subdomains need the equivalent wildcard block added to the **Kalakosh-ch** Caddyfile instead:

1. **Wildcard DNS:** add `*.zolto.kalakosh.ch A <server-ip>` alongside the existing `zolto.kalakosh.ch` record.
2. **Add a wildcard block to the Kalakosh-ch Caddyfile**, using on-demand TLS gated by Zolto's `/api/domain-ask` endpoint (reachable over the same `kalakosh-shared` network):

   ```
   {
       on_demand_tls {
           ask http://<zolto-app-container-name>:3000/api/domain-ask
       }
   }

   *.zolto.kalakosh.ch {
       tls {
           on_demand
       }
       reverse_proxy <zolto-app-container-name>:3000
   }
   ```

   Replace `<zolto-app-container-name>` with whatever the Zolto app container is actually named on the shared network (check `docker compose ps` in the Zolto stack — commonly `zolto-app-1` or similar). If the Kalakosh-ch Caddy already has its own `on_demand_tls` global block for something else, Caddy only allows one `ask` URL for the whole instance — you'll need to point that single `ask` at an endpoint that can distinguish Kalakosh's own on-demand hosts from Zolto's tenant subdomains (or fold the check into whichever service already backs it).
3. The `/api/domain-ask` endpoint already reads `PUBLIC_BASE_URL` (which you set to `https://zolto.kalakosh.ch` in step 3 above) to know the platform's root domain, so no extra Zolto-side config is needed — it'll recognize `blah.zolto.kalakosh.ch` and check `blah` against the tenants table correctly once the DNS and Caddy block above are in place.

To run Zolto **standalone** instead (its own domain/IP with its own Caddy), see [Step 7 — Configure Caddy](#step-7--configure-caddy) and start it with `docker compose --profile standalone up -d`.

---

## Step 1 — Provision Your VPS

Any provider works. Hetzner is recommended for European users (fast, cheap, GDPR-compliant).

1. Create a server with Ubuntu 24.04.
2. Note the public IP address.
3. SSH in: `ssh root@YOUR_SERVER_IP`

---

## Step 2 — Install Docker

```bash
curl -fsSL https://get.docker.com | sh
docker --version
docker compose version
```

---

## Step 3 — Point Your Domain to the Server

In your domain registrar's DNS settings (e.g. Swissonic.ch), add:

| Type | Name  | Value            | TTL |
| ---- | ----- | ---------------- | --- |
| `A`  | `@`   | `YOUR_SERVER_IP` | 300 |
| `A`  | `www` | `YOUR_SERVER_IP` | 300 |

Verify propagation: `dig +short yourdomain.com`

---

## Step 4 — Set Up Google OAuth

This is the only admin login method. No password is stored on your server.

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use an existing one)
3. Go to **APIs & Services → OAuth consent screen**
   - User type: **External**
   - Fill in app name (e.g. "Kalakosh Admin"), your email, and save
   - Under **Test users**, add `shwena9@gmail.com`
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Authorized redirect URIs: `https://yourdomain.com/api/oauth/callback`
   - Click **Create** and copy the **Client ID** and **Client Secret**

> **Important:** The redirect URI must exactly match your domain. If you use `www`, add both `https://yourdomain.com/api/oauth/callback` and `https://www.yourdomain.com/api/oauth/callback`.

---

## Step 5 — Get the Code

Download the project ZIP from the Manus Management UI (⋯ → Download as ZIP), upload it to your server, and unzip:

```bash
scp kalakosh-selfhost.zip root@YOUR_SERVER_IP:/opt/
ssh root@YOUR_SERVER_IP
cd /opt && unzip kalakosh-selfhost.zip && cd kalakosh-selfhost
```

---

## Step 6 — Configure Environment Variables

```bash
cp .env.example .env
nano .env
```

### Required values

**Database** — internal MySQL credentials, choose any strong passwords:

```env
MYSQL_ROOT_PASSWORD=a_strong_root_password
MYSQL_DATABASE=kalakosh
MYSQL_USER=kalakosh_user
MYSQL_PASSWORD=a_strong_user_password
```

**Session secret** — generate a random 32-char string:

```bash
openssl rand -hex 32
```

```env
JWT_SECRET=<output of above command>
```

**Google OAuth** — from Step 4:

```env
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
ADMIN_EMAIL=shwena9@gmail.com
```

**Discord Bot:**

```env
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_CHANNEL_ID=your_channel_id
DISCORD_OWNER_USER_ID=your_discord_user_id   # optional, for DM notifications
```

**LLM — Groq (recommended, free tier):**
Sign up at [console.groq.com](https://console.groq.com) → API Keys.

```env
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEY=gsk_your_groq_key
LLM_MODEL=llama3-8b-8192
```

**S3 Storage — Cloudflare R2 (recommended, free 10 GB):**
Create a bucket at [dash.cloudflare.com](https://dash.cloudflare.com) → R2.

```env
S3_BUCKET=kalakosh-images
S3_REGION=auto
S3_ACCESS_KEY_ID=your_r2_access_key
S3_SECRET_ACCESS_KEY=your_r2_secret_key
S3_ENDPOINT=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
S3_PUBLIC_URL=https://pub-HASH.r2.dev   # enable public access in R2 dashboard
```

**Stripe Payments (cards + TWINT, optional):**
Online checkout is handled by [Stripe](https://dashboard.stripe.com). Use a
Swiss/CHF Stripe account so TWINT is available. In the dashboard enable the
**Cards** and **TWINT** payment methods, then add a webhook endpoint pointing
to `https://yourdomain.com/api/stripe/webhook` subscribed to
`checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed` and `checkout.session.expired`.

```env
STRIPE_SECRET_KEY=sk_live_your_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_signing_secret
PUBLIC_BASE_URL=https://yourdomain.com   # used for Stripe success/cancel redirects
```

If `STRIPE_SECRET_KEY` is left blank, the storefront hides online payment and
customers are routed to the WhatsApp enquiry flow instead.

**Stripe Connect (optional — lets tenants link their own Stripe account):**
Separate from the platform's own `STRIPE_SECRET_KEY` above: Stripe Connect lets
each *tenant* link their own Stripe account so their storefront's checkout and
POS/Tap to Pay payouts go directly to them, not through the platform account.
Without it, tenant admins see "Stripe Connect isn't set up on the platform yet"
when they try to connect on the admin page — this is expected until configured.

1. In the [Stripe Dashboard](https://dashboard.stripe.com) (the platform's own
   account), go to **Settings → Connect → Settings** and enable **OAuth for
   Standard accounts** if it isn't already.
2. Copy the **Client ID** (`ca_...`) shown there.
3. Add the OAuth redirect URI `https://yourdomain.com/api/stripe/connect/callback`
   under the same Connect OAuth settings.

```env
STRIPE_CONNECT_CLIENT_ID=ca_your_connect_client_id
```

`JWT_SECRET` (set earlier, above) is reused to sign the OAuth `state` param, so
it must also be set. Leave `STRIPE_CONNECT_CLIENT_ID` blank to keep this
feature disabled.

**POS Terminal / Tap to Pay (optional):**
The Android and iOS market-stall apps authenticate requests with a shared API key and use Stripe Terminal for in-person payments. Add a second webhook endpoint at `https://yourdomain.com/api/pos/webhook` subscribed to `payment_intent.succeeded`.

```bash
openssl rand -hex 32   # generate POS_API_KEY
```

```env
POS_API_KEY=<generated above>
STRIPE_POS_WEBHOOK_SECRET=whsec_your_pos_webhook_signing_secret
# Stripe Terminal Location for Tap to Pay (Dashboard → More → Terminal → Locations).
# Served to the POS apps at runtime via GET /api/pos/config — not baked into the builds.
STRIPE_LOCATION_ID=tml_your_location_id
```

Leave all three blank if you are not using the POS apps.

**Backups (optional):**
`deploy/backup.sh` dumps the database, exports inventory CSV, and uploads to a secondary S3 bucket and/or a private GitHub repository. Run it from cron or manually.

```env
# Secondary S3 (e.g. Backblaze B2 if primary is Cloudflare R2)
BACKUP_S3_BUCKET=kalakosh-backups
BACKUP_S3_REGION=us-west-004
BACKUP_S3_ACCESS_KEY_ID=your_b2_key_id
BACKUP_S3_SECRET_ACCESS_KEY=your_b2_app_key
BACKUP_S3_ENDPOINT=https://s3.us-west-004.backblazeb2.com

# GitHub private repo — each weekly backup is committed as backup.sql + inventory.csv
BACKUP_GITHUB_REPO=youruser/kalakosh-backups
BACKUP_GITHUB_TOKEN=github_pat_...
```

Leave blank to skip backups.

---

## Step 7 — Configure Caddy

> Serving Zolto at **zolto.kalakosh.ch** instead? Skip this step — the Kalakosh-ch Caddy handles TLS and routing for you. See [Running alongside Kalakosh-ch](#running-alongside-kalakosh-ch-served-at-zoltokalakoshch).

Zolto's bundled Caddy is only used for **standalone** deploys (its own domain/IP) and lives behind the `standalone` compose profile. Point `SITE_DOMAIN` (in `.env`) at your domain so Caddy provisions HTTPS automatically.

**Every tenant gets a storefront at `<slug>.{SITE_DOMAIN}`** (e.g. `blah.zolto.ch`), so DNS needs a **wildcard** record, not just the apex:

```
A     zolto.ch        <server-ip>
A     *.zolto.ch      <server-ip>
```

One wildcard `A` record covers every tenant subdomain — you never register a new DNS entry per tenant. The bundled Caddyfile already has a `*.{$SITE_DOMAIN}` block wired to on-demand TLS: the first time `blah.zolto.ch` is visited, Caddy asks the app (`/api/domain-ask`) whether `blah` is a real tenant slug, and only then requests a Let's Encrypt certificate for that specific hostname (a real wildcard certificate isn't possible over plain HTTP-01, so Caddy issues one cert per subdomain, on demand). Nothing else to configure — this works as soon as the wildcard DNS record resolves to your server.

---

## Step 8 — Start Everything

For a **standalone** deploy (Zolto's own Caddy on its own domain), enable the profile so Caddy starts:

```bash
docker compose --profile standalone up -d
docker compose logs -f app   # watch startup logs
```

Caddy will obtain an SSL certificate within ~30 seconds. Visit your `SITE_DOMAIN` to see the storefront.

> Running **alongside Kalakosh-ch** at zolto.kalakosh.ch? Use `docker compose up -d` (no profile) — the app joins the shared network and the Kalakosh Caddy serves it. See [Running alongside Kalakosh-ch](#running-alongside-kalakosh-ch-served-at-zoltokalakoshch).

To access the admin panel, go to `https://yourdomain.com/admin` and click **Sign in with Google**.

---

## Ongoing Operations

### View logs

```bash
docker compose logs -f app     # application + Discord bot logs
docker compose logs -f caddy   # access logs
```

### Update the application

```bash
./update.sh
```

Pulls the checked-out branch, applies any new migrations, rebuilds, restarts and
reloads Caddy. It skips the two expensive steps when the change doesn't need
them, so a deploy that pulled only a docs change finishes in seconds instead of
minutes:

- **The image rebuild** is skipped when the running container was already built
  from exactly this source. Each image is stamped with a hash of its build
  context (`docker inspect` → `ch.zolto.source-fingerprint`), and that is
  compared against the working tree — including uncommitted edits and `.env`,
  since `VITE_*` values are compiled into the frontend bundle.
- **The migrations** are skipped when this exact migration set already ran to
  completion against this database, recorded in the `deploy_state` table.

Both fail towards doing the work. No running container, an image from before
fingerprinting, a dirty tree, a restored database — anything unproven rebuilds
and re-migrates, because shipping stale code is the failure that matters and a
redundant build only costs time.

When you need the old unconditional behaviour:

```bash
./update.sh --full               # cold rebuild + all migrations + full prune
./update.sh --rebuild            # rebuild, still using the layer cache
./update.sh --force-migrations   # re-run every migration
./update.sh --help               # all options
```

The aggressive `docker image prune -a` / `docker builder prune -a` sweep now
runs only when the disk is at or above 70% (`PRUNE_DISK_PCT`), or on `--prune`.
Below that, `update.sh` collects stopped containers, dangling images and
week-old cache, and leaves the layer cache warm — pruning it is what made every
build cold. If you are tight on disk, drop `PRUNE_DISK_PCT` or run
`./update.sh --prune`.

To rebuild by hand without the script:

```bash
docker compose build app
docker compose up -d app
```

### Backup the database

```bash
docker compose exec db mysqldump -u root -p kalakosh > backup_$(date +%Y%m%d).sql
```

### Restore from backup

```bash
cat backup_20260101.sql | docker compose exec -T db mysql -u root -p kalakosh
```

### Stop everything

```bash
docker compose down
```

> **If you started the bundled Caddy** (`docker compose --profile standalone up -d`), stop it the same way — re-enable the profile so `down` also removes the Caddy container:
>
> ```bash
> docker compose --profile standalone down
> ```
>
> A plain `docker compose down` does **not** remove containers belonging to a profile that isn't currently enabled, so the standalone Caddy is left running and attached to `zolto_internal`, and the teardown fails with *"Network zolto_internal Resource is still in use"* (see Troubleshooting).

### Reconcile Stripe payments

Card terminals and webhooks can occasionally miss recording a sale locally.
The **Reconcile Stripe Payments** button in the admin panel scans recent
successful Stripe payments for any with no matching row in the local orders
or POS sales tables, guesses the 1-3 in-stock pieces closest in price to each
one, and — if `RESEND_API_KEY` and `ADMIN_EMAIL` are set — emails `ADMIN_EMAIL`
a shortlist with one-click links. Clicking a link opens a confirmation page;
only after you click **Confirm** there is the sale recorded and inventory
decremented. This never runs automatically — trigger it from the admin panel
whenever you suspect a payment is missing.

---

## Environment Variable Reference

| Variable                      | Required | Description                                                                                                 |
| ----------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `MYSQL_*`                     | Yes      | Internal database credentials                                                                               |
| `JWT_SECRET`                  | Yes      | Session cookie signing secret (32+ chars)                                                                   |
| `GOOGLE_CLIENT_ID`            | Yes      | Google OAuth client ID                                                                                      |
| `GOOGLE_CLIENT_SECRET`        | Yes      | Google OAuth client secret                                                                                  |
| `ADMIN_EMAIL`                 | Yes      | Google account allowed to log in as admin                                                                   |
| `DISCORD_BOT_TOKEN`           | Yes      | Discord bot token                                                                                           |
| `DISCORD_CHANNEL_ID`          | Yes      | Channel to watch for new products                                                                           |
| `DISCORD_OWNER_USER_ID`       | No       | Your Discord user ID for DM notifications                                                                   |
| `LLM_BASE_URL`                | Yes      | OpenAI-compatible API base URL                                                                              |
| `LLM_API_KEY`                 | Yes      | API key (`ollama` for local Ollama)                                                                         |
| `LLM_MODEL`                   | Yes      | Model name (e.g. `llama3-8b-8192`)                                                                          |
| `S3_BUCKET`                   | Yes      | Storage bucket name                                                                                         |
| `S3_REGION`                   | Yes      | Region (`auto` for R2)                                                                                      |
| `S3_ACCESS_KEY_ID`            | Yes      | Storage access key                                                                                          |
| `S3_SECRET_ACCESS_KEY`        | Yes      | Storage secret key                                                                                          |
| `S3_ENDPOINT`                 | No       | Custom endpoint for non-AWS providers                                                                       |
| `S3_PUBLIC_URL`               | No       | Public CDN base URL for serving images                                                                      |
| `STRIPE_SECRET_KEY`           | No       | Stripe secret key — enables card & TWINT checkout                                                           |
| `STRIPE_WEBHOOK_SECRET`       | No       | Signing secret for `/api/stripe/webhook`                                                                    |
| `STRIPE_CONNECT_CLIENT_ID`    | No       | Platform's Connect OAuth client ID (`ca_...`) — lets tenants link their own Stripe account                  |
| `PUBLIC_BASE_URL`             | No       | Canonical site URL — Stripe redirects, Google OAuth's redirect_uri, and recognizing tenant subdomains all key off this |
| `POS_API_KEY`                 | No       | Shared secret for the POS apps — Android and iOS (generate with `openssl rand -hex 32`)                     |
| `STRIPE_POS_WEBHOOK_SECRET`   | No       | Signing secret for `/api/pos/webhook`                                                                       |
| `STRIPE_LOCATION_ID`          | No       | Stripe Terminal Location ID served to POS apps at runtime via `GET /api/pos/config` — not baked into builds |
| `BACKUP_S3_BUCKET`            | No       | Secondary S3 bucket for database backups                                                                    |
| `BACKUP_S3_REGION`            | No       | Region for secondary backup bucket                                                                          |
| `BACKUP_S3_ACCESS_KEY_ID`     | No       | Access key for secondary backup bucket                                                                      |
| `BACKUP_S3_SECRET_ACCESS_KEY` | No       | Secret key for secondary backup bucket                                                                      |
| `BACKUP_S3_ENDPOINT`          | No       | Endpoint for secondary backup provider (e.g. Backblaze B2)                                                  |
| `BACKUP_GITHUB_REPO`          | No       | Private GitHub repo for weekly SQL + CSV backup commits                                                     |
| `BACKUP_GITHUB_TOKEN`         | No       | Fine-grained PAT with Contents: Read & Write for the backup repo                                            |

`PUBLIC_BASE_URL` is technically optional (a single-host deploy without it still works, deriving everything from the incoming request), but strongly recommended once tenant subdomains are in play — see the troubleshooting entry below.

---

## Troubleshooting

**"Sign in with Google" shows an error**
Ensure the redirect URI in Google Cloud Console exactly matches `https://yourdomain.com/api/oauth/callback`. Also confirm `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are correct in `.env`.

**"Access denied" after Google login**
Only the email set in `ADMIN_EMAIL` is allowed. Confirm you are signing in with `shwena9@gmail.com` (or whatever you set).

**Site shows "502 Bad Gateway"**
The app container may still be starting. Check: `docker compose logs app`. If it shows a database connection error, wait 10–15 seconds and retry.

**SSL certificate not issued**
Ensure your domain's DNS A record points to the correct server IP and has propagated. Check: `docker compose logs caddy`.

**`ERR_SSL_PROTOCOL_ERROR` on a tenant subdomain (e.g. `blah.zolto.ch`)**
Almost always one of:
- No wildcard DNS record. An `A` record for the apex (`zolto.ch`) does **not** cover subdomains — you also need `*.zolto.ch` pointing at the server IP (see Step 7).
- `blah` isn't an actual tenant slug yet, or the tenant record hasn't propagated to the DB the app is reading. Caddy's on-demand TLS refuses to mint a cert for hostnames `/api/domain-ask` doesn't recognize — check `docker compose logs app` for `[DomainAsk]` lines, or ask the endpoint directly: `docker compose exec app curl -s "http://localhost:3000/api/domain-ask?domain=blah.zolto.ch" -o /dev/null -w '%{http_code}\n'` (200 = tenant found, 404 = no such slug).
- DNS hasn't propagated yet after adding the wildcard record — give it a few minutes and retry.

**"Error 400: redirect_uri_mismatch" signing in with Google on a tenant subdomain (e.g. `blah.zolto.ch`)**
Google OAuth requires an exact, pre-registered redirect URI and doesn't support wildcard subdomains, so the app always routes the OAuth round-trip through **`PUBLIC_BASE_URL`'s own host** — never whichever tenant subdomain the merchant started from. This error means that host mismatch is happening anyway, which points to `PUBLIC_BASE_URL` not being set (or set wrong) in `.env`:
- Set `PUBLIC_BASE_URL=https://zolto.ch` (or `https://zolto.kalakosh.ch` if running alongside Kalakosh-ch) and restart the app.
- Confirm Google Cloud Console's Authorized redirect URIs list contains exactly `https://<PUBLIC_BASE_URL host>/api/oauth/callback` — one entry covers every tenant, current and future.
- The tenant is then redirected back to their own subdomain automatically after login (the session cookie is scoped to the whole `*.zolto.ch` family once `PUBLIC_BASE_URL` is set, not just the one host that issued it).

**A tenant admin's "Connect Stripe" fails or redirects with `stripeConnect=error` on a tenant subdomain (e.g. `blah.zolto.ch`)**
Same class of issue as the Google `redirect_uri_mismatch` above: Stripe also requires an exact, pre-registered redirect URI with no wildcard subdomains, so the app always routes the Connect OAuth round-trip through **`PUBLIC_BASE_URL`'s own host**, never whichever tenant subdomain the admin clicked "Connect Stripe" from.
- Set `PUBLIC_BASE_URL=https://zolto.ch` (or `https://zolto.kalakosh.ch` if running alongside Kalakosh-ch) and restart the app.
- Confirm the Stripe Dashboard's Connect OAuth settings list the redirect URI exactly as `https://<PUBLIC_BASE_URL host>/api/stripe/connect/callback` — one entry covers every tenant, current and future.
- If `PUBLIC_BASE_URL` is unset entirely, the app falls back to the request's own host — this works only for whichever single host happens to match what's registered in Stripe, and fails for every other tenant subdomain.

**Discord bot not connecting**
Verify `DISCORD_BOT_TOKEN` is correct and the bot has been added to your server with **Message Content Intent** enabled.

**Products not being added from Discord**
Check `DISCORD_CHANNEL_ID` is the numeric ID (not the channel name). Check `docker compose logs app` for LLM errors.

**Images not showing**
If `S3_PUBLIC_URL` is not set, images are served via signed URLs through the `/uploads/` proxy. Ensure all `S3_*` credentials are correct.

**`docker compose down` fails with "Network zolto_internal Resource is still in use"**
Compose stopped the app/db containers but could not remove the `zolto_internal` network because another container is still attached to it. First see what is still attached:

```bash
docker network inspect zolto_internal \
  --format '{{range .Containers}}{{.Name}} {{end}}'
```

- **`zolto-caddy-1`** — you started the bundled Caddy with `--profile standalone`, but a plain `docker compose down` does not remove containers behind a profile that isn't enabled (and `--remove-orphans` won't touch it either, since it's a declared service, not an orphan). Re-enable the profile so `down` matches it:

  ```bash
  docker compose --profile standalone down
  ```

- **`kalakosh-runner-<pid>`** — a leftover throwaway runner from an interrupted `./update.sh` (the translation-backfill / language-fix step attaches a short-lived container to this network). Remove it, then tear down:

  ```bash
  docker rm -f kalakosh-runner-<pid>
  docker compose down --remove-orphans
  ```

  `./update.sh` now names these runners and force-removes them on exit (even on Ctrl-C), so fresh installs should not hit this case.

## Tenant custom domains (Maker plan and above)

Tenants can serve their storefront on their own domain. Two pieces make it work:

1. **`GET /api/domain-ask?domain=…`** — already in the app. Caddy's on-demand
   TLS calls this before minting a certificate; it answers 200 only for domains
   a tenant actually saved (and whose plan still includes custom domains), so
   strangers can't drive Let's Encrypt issuance through your Caddy.
2. **Caddy on-demand TLS** — add a wildcard-ish block to the Caddyfile:

   ```
   {
       on_demand_tls {
           ask http://app:3000/api/domain-ask
       }
   }

   https:// {
       tls {
           on_demand
       }
       reverse_proxy app:3000
       encode gzip
   }
   ```

   Set `PLATFORM_DOMAIN` (e.g. `app.zolto.ch`) in `.env` — tenants get shown
   "CNAME your domain → app.zolto.ch" in Plan & Billing, and the app live-checks
   their DNS. HTTPS is issued automatically on the first visit after DNS points.
