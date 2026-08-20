# Installing GwinnPOS on your iPhone (no Mac required)

> This app was migrated from the standalone `ankurgupta7/kalakosh-pos-ios`
> repo into the Gwinn monorepo. It lives in `ios/GwinnPOS/` and its CI
> runs from this repo now.

## What's set up in this repo

| File | Purpose |
|------|---------|
| `ios/GwinnPOS/project.yml` | xcodegen spec — CI uses this to generate the `.xcodeproj` |
| `.github/workflows/ios-pos-build.yml` | GitHub Actions — free simulator build + tests on every change under `ios/GwinnPOS/` |
| `codemagic.yaml` (workflows `ios-pos-*`) | Codemagic — builds a signed IPA and sends you an install link |

---

## Option A: Codemagic (Recommended — install link straight to iPhone)

### What you need
- A free [Codemagic](https://codemagic.io) account
- An [Apple Developer account](https://developer.apple.com) — **free tier works** for development installs on up to 3 devices (7-day signing), **$99/year** for ad-hoc (90-day) and TestFlight

### Steps

1. **Connect the repo**
   - codemagic.io → *Add application* → *GitHub* → select `gwinn`
   - Choose *"Other"* app type → select *YAML configuration*

2. **Set up code signing (in Codemagic web UI — no Mac)**
   - App settings → *Code signing* → *iOS*
   - Click *"Automatic"* — Codemagic logs into your Apple account and creates certificates itself
   - Or upload your own `.p12` + provisioning profile if you have them

3. **Trigger a build**
   - Click *Start build* → choose workflow `ios-pos-adhoc`
   - Build takes ~10–15 min on the free M1 runner

4. **Install on iPhone**
   - When the build finishes, Codemagic emails you
   - Click the link on your iPhone in Safari → *Install* → done

### Free tier limits
| Plan | Build minutes | Enough for? |
|------|-------------|-------------|
| Free | 500 min/month | ~30–40 builds |
| Pay-as-you-go | $0.038/min | Unlimited |

---

## Option B: GitHub Actions (free) + AltStore (free, no Apple Developer needed)

This path is 100% free but requires one-time setup of AltStore.

### Steps

1. **Push to main or trigger manually**
   - Go to GitHub → Actions → *iOS POS Build & Test* → *Run workflow*
   - Check *"Export signed IPA"* only if you have signing secrets configured
   - The simulator build always runs for free

2. **Set up AltStore on your iPhone**  
   - **Windows/Mac**: Download [AltServer](https://altstore.io) on your computer, plug in iPhone via USB, install AltStore
   - **Linux**: Use [AltServer-Linux](https://github.com/NyaMisty/AltServer-Linux) — same process over USB
   - AltStore uses your free Apple ID to sign apps (7-day re-sign required)

3. **Install the IPA**
   - Download the IPA artifact from GitHub Actions
   - Open in AltStore on your iPhone

---

## Option C: GitHub Actions + Signed IPA (paid Apple Developer)

### Secrets to add (GitHub repo → Settings → Secrets)

| Secret name | How to get it |
|-------------|--------------|
| `CERTIFICATE_P12_BASE64` | Export your Distribution cert from Keychain as `.p12`, then: `base64 -i cert.p12` |
| `CERTIFICATE_PASSWORD` | The password you set when exporting |
| `PROVISIONING_PROFILE_BASE64` | Download `.mobileprovision` from developer.apple.com, then: `base64 -i profile.mobileprovision` |
| `KEYCHAIN_PASSWORD` | Any random string, e.g. `openssl rand -hex 16` |
| `DEVELOPMENT_TEAM_ID` | Your 10-char team ID from developer.apple.com |
| `PROVISIONING_PROFILE_NAME` | The profile name string |

### Repo variable
- `SIGNING_CONFIGURED` = `true` (enables device build on main branch pushes)

---

## Special note: Tap to Pay on iPhone

Stripe Terminal's Tap to Pay requires:
1. The `com.apple.developer.proximity-reader.payment.acceptance` entitlement (already in `GwinnPOS.entitlements`)
2. **Apple must approve this entitlement** — apply at [stripe.com/docs/terminal/payments/setup-integration?terminal-sdk-platform=ios](https://stripe.com/docs/terminal/payments/setup-integration?terminal-sdk-platform=ios)
3. A paid Apple Developer account ($99/year)
4. iPhone XS or later, iOS 16.0+, in a supported country
5. A **Stripe Terminal Location** — the reader registers against this. The app
   fetches it at runtime from the backend (`GET /api/pos/config`), so nothing
   Stripe-specific is baked into the build. Set `STRIPE_LOCATION_ID` on the POS
   API server (see the server's `.env.example`). Until it's set, the payment
   screen shows a "Card payments not set up yet" guide instead of failing.

Until approved, the app builds and runs fine — the Tap to Pay button just won't work.

> **Bundle id**: the app identifier is `ch.gwinn.pos`. If your signing assets
> were created for the old `ch.kalakosh.pos` identifier, the App ID,
> provisioning profiles, App Store Connect record, and the Tap to Pay
> entitlement approval all need re-creating for `ch.gwinn.pos` — they are tied
> to the bundle id and do not carry over.
