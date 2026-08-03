import Foundation
import StripeTerminal

/// Supplies Stripe Terminal connection tokens from our backend
/// (`POST /api/pos/connection-token`).
///
/// A single shared instance is registered once with `Terminal.setTokenProvider`
/// at app launch (see `KalakoshPOSApp`). Using a long-lived singleton — rather than
/// a per-screen view model — guarantees the provider outlives every payment so the
/// SDK can always refresh a token. This mirrors the Android app, where the Terminal
/// is initialised once with a `StripeTokenProvider`.
final class StripeTokenProvider: NSObject, ConnectionTokenProvider {
    static let shared = StripeTokenProvider()

    // SDK v4.x imports the completion-based `fetchConnectionToken(_:)` requirement
    // as an async throwing method; returning the secret (or throwing) satisfies it.
    func fetchConnectionToken() async throws -> String {
        let response = try await ApiService.shared.getConnectionToken()
        return response.secret
    }
}
