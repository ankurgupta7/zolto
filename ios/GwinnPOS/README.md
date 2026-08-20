# Gwinn POS iOS

iOS version of the Gwinn Point of Sale application, ported from Android.

Lives at `ios/GwinnPOS/` in the Gwinn monorepo (migrated from the
standalone `ankurgupta7/kalakosh-pos-ios` repo). The `.xcodeproj` is not
committed — generate it with `xcodegen generate --spec project.yml` from this
directory. CI: `.github/workflows/ios-pos-build.yml` (simulator + tests) and
the `ios-pos-*` workflows in the repo-root `codemagic.yaml` (signed IPAs).
See `SETUP.md` here for device-install options.

It is generic and multi-tenant: any Gwinn merchant pairs the app with their
own store using their per-tenant POS API key. Nothing store-specific is baked
into the build.

## Features

- **Store pairing**: First-run pairing by scanning the QR on the merchant's
  Keys & access page, or by typing the POS API key. Credentials live in the
  iOS Keychain; a rotated or revoked key routes back to the pairing screen.
- **Runtime branding**: The paired store's name, logo, and currency come from
  `GET /api/pos/config` — the app chrome itself stays neutral Gwinn.
- **Product Grid**: Browse the store's products with images and stock levels.
- **Sale Review**: Review selected items, bargain prices, add custom items.
- **Payments**: Stripe Terminal Tap to Pay on iPhone (connection tokens minted
  on the tenant's own connected Stripe account), TWINT via Stripe redirect,
  and cash (works offline, syncs later).
- **Sales History**: View past transactions.

## Technical Details

- **Language**: Swift 5.9+
- **UI Framework**: SwiftUI
- **Networking**: URLSession with async/await, tenant-scoped by the POS key
- **Payment**: Stripe Terminal iOS SDK

## Setup

1. Generate the project: `xcodegen generate --spec project.yml`, then open
   `GwinnPOS.xcodeproj` in Xcode.
2. Build and run — on first launch the app asks to pair with a store.
3. Pair with the POS API key from the store admin (Account → Keys & access).
   The server URL defaults to `https://gwinn.ch`; self-hosted stores enter
   their own.

> **Apple-side note**: the bundle id is `ch.gwinn.pos`. Provisioning profiles
> and the Tap to Pay entitlement are tied to the bundle id and must be granted
> for this identifier in the Apple Developer portal.

CI authenticates against a live server with the **platform POS test key** —
minted by the superadmin in the operator console (Platform → POS test key),
an ordinary `platform-tests` tenant key with no special rules — stored as the
`POS_API_KEY` secret. The health check never skips: a missing or rejected key
fails the build.

## Project Structure

- `Models/`: Data structures for Products, Sales, and API responses.
- `Views/`: SwiftUI views for all screens (including `PairingView`).
- `ViewModels/`: Business logic and state management.
- `Services/`: Networking, Keychain credential store, store session.
- `Logic/`: Pure, unit-tested logic (money, pairing, filtering).
