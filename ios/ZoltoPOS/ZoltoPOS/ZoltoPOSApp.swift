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
        }
        .modelContainer(for: [ProductModel.self, SaleModel.self, PendingTransactionModel.self])
    }
}
