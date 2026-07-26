# Zolto POS (Android)

Multi-tenant POS register for zolto stores. Ported from the single-tenant
kalakosh-pos-android app (same payment flow: Tap to Pay via Stripe Terminal,
TWINT QR, cash, offline queue with background sync).

## How a register is bound to a store

Zolto is multi-tenant, so nothing store-specific is baked into the APK:

1. First launch shows **SetupActivity**: enter the zolto server URL and the
   store's POS API key (from the store's admin). Verified against
   `GET /api/pos/health`, then persisted (`PosConfig`, SharedPreferences).
2. All API calls carry `X-POS-Key`; the server resolves the tenant from it.

## Tap to Pay (card payments on the phone, no reader)

Runs on the **merchant's own connected Stripe account**, so in-person and
online revenue land in the same place:

1. `POST /api/pos/terminal/connection-token` — SDK connection token, minted on
   the connected account (`StripeTokenProvider`).
2. `GET /api/pos/config` → tenant's Terminal Location id. On first use it's
   blank → `PaymentActivity` collects the store address once and calls
   `POST /api/pos/terminal/location`, which creates the Location on the
   connected account and stores the id server-side.
3. `POST /api/pos/payment-intent` — `card_present` intent created on the
   connected account in the tenant's currency; the SDK collects on the phone.

Requires a Tap-to-Pay-enabled Stripe account and an NFC phone; debug builds
use the simulated reader.

## Build & test

    ./gradlew test            # JVM unit tests (incl. API wire-format contract tests)
    ./gradlew assembleDebug   # debug APK

CI: `.github/workflows/android-build.yml` runs on any change under `android/`.
