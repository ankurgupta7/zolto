# Gwinn POS (Android)

Multi-tenant POS register for gwinn stores. Ported from the single-tenant
kalakosh-pos-android app (same payment flow: Tap to Pay via Stripe Terminal,
TWINT QR, cash, offline queue with background sync).

## How a register is bound to a store

Gwinn is multi-tenant, so nothing store-specific is baked into the APK:

1. First launch shows **SetupActivity**: enter the gwinn server URL and the
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

There is **no Gradle wrapper in this repo** — use a local Gradle 8.9
(`brew install gradle`, SDKMAN, or Android Studio's bundled one):

    gradle test            # JVM unit tests (incl. API wire-format contract tests)
    gradle assembleDebug   # debug APK

CI: `.github/workflows/android-build.yml` runs on any change under `android/`.
It provisions Gradle 8.9 through `gradle/actions/setup-gradle` and calls
`gradle` the same way.

### Why there's no wrapper

The committed wrapper was broken three ways and had never once run in CI:

- `gradle-wrapper.jar` was a Gradle **4.4.1** jar (per its embedded
  `build-receipt.properties`) while `gradle-wrapper.properties` asked for
  **8.9**. Its SHA-256 wasn't in Gradle's published set, so
  `setup-gradle`'s wrapper validation failed the job before any test ran —
  which is exactly the supply-chain mismatch that check exists to catch.
- `gradlew` was committed non-executable (mode `100644`), so even past
  validation, `./gradlew` would have died with "Permission denied".
- There was no `gradlew.bat`, so Windows had nothing to run.

Replacing the jar needs a checksum-verified `gradle-8.9-bin.zip`, so the
sound options were "commit an unverified binary" or "remove it". It was
removed. `gradle-wrapper.properties` stays as the version pin.

To restore a real wrapper, on a machine with network access to
`downloads.gradle.org`:

    cd android
    gradle wrapper --gradle-version 8.9   # writes gradlew, gradlew.bat, the jar
    git update-index --chmod=+x gradlew   # keep it executable in git

then switch the `gradle` calls in the workflow back to `./gradlew`. Don't set
`validate-wrappers: false` to get around a validation failure — that silences
the guard rather than fixing the jar.
