import SwiftUI
import SwiftData
import StripeTerminal

@main
struct ZoltoPOSApp: App {
    @StateObject private var productViewModel = ProductViewModel()

    init() {
        // Register the connection-token provider exactly once, before anything
        // touches `Terminal.shared`. Required for Tap to Pay; without it the
        // first Terminal access traps.
        Terminal.setTokenProvider(StripeTokenProvider.shared)
    }

    var body: some Scene {
        WindowGroup {
            MainView()
                .environmentObject(productViewModel)
                // One-tap pairing: the merchant taps a link in their admin and
                // the register binds itself, instead of someone typing 64 hex
                // characters into a phone at a market stall. Anything that isn't
                // a pairing link is ignored rather than surfaced — the OS can
                // hand us URLs we never asked for.
                .onOpenURL { url in
                    guard let link = Pairing.parsePairingLink(url) else { return }
                    Task { await StoreSession.shared.pair(with: link) }
                }
        }
        .modelContainer(for: [ProductModel.self, SaleModel.self, PendingTransactionModel.self])
    }
}
