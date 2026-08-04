# Zolto POS iOS

iOS version of the Zolto Point of Sale application, ported from Android.

Lives at `ios/ZoltoPOS/` in the Zolto monorepo (migrated from the
standalone `ankurgupta7/kalakosh-pos-ios` repo). The `.xcodeproj` is not
committed — generate it with `xcodegen generate --spec project.yml` from this
directory. CI: `.github/workflows/ios-pos-build.yml` (simulator + tests) and
the `ios-pos-*` workflows in the repo-root `codemagic.yaml` (signed IPAs).
See `SETUP.md` here for device-install options.

## Features

- **Product Grid**: Browse available products with images and stock levels.
- **Sale Review**: Review selected items before charging.
- **Stripe Terminal Integration**: Support for card-present payments using Stripe local mobile discovery (Tap to Pay on iPhone).
- **Sales History**: View past transactions.

## Technical Details

- **Language**: Swift 5.9+
- **UI Framework**: SwiftUI
- **Networking**: URLSession with async/await
- **Payment**: Stripe Terminal iOS SDK

## Setup

1. Open `ZoltoPOS.xcodeproj` in Xcode.
2. Ensure you have the Stripe Terminal SDK added via Swift Package Manager.
3. Configure the `ApiService` with your backend URL and API Key.
4. Set up the necessary permissions in `Info.plist` for Bluetooth and Location (required by Stripe Terminal).

## Project Structure

- `Models/`: Data structures for Products, Sales, and API responses.
- `Views/`: SwiftUI views for all screens.
- `ViewModels/`: Business logic and state management.
- `Services/`: Networking and external integrations.
