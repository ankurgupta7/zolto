import Foundation
import SwiftData
import Combine

/**
 * Central coordinator for offline payment support on iOS.
 *
 * - Records every sale locally (as [PendingTransactionModel]) as soon as it
 *   happens, regardless of connectivity.
 * - When online, attempts immediate sync; when offline, the transaction stays
 *   pending until connectivity returns and [syncAllPending] is called.
 * - Provides [pendingCount] via Combine so the UI can show a badge.
 */
@MainActor
class OfflinePaymentManager: ObservableObject {
    static let shared = OfflinePaymentManager()

    private let networkMonitor = NetworkMonitor()
    private var modelContext: ModelContext?
    private var cancellables = Set<AnyCancellable>()

    /// True when the device has an active internet connection.
    @Published var isOnline: Bool = true

    /// Number of transactions waiting to be synced.
    @Published var pendingCount: Int = 0

    private init() {
        networkMonitor.$isOnline
            .receive(on: DispatchQueue.main)
            .assign(to: &$isOnline)

        networkMonitor.start()

        // Poll pending count periodically
        Timer.publish(every: 2.0, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                Task { @MainActor in
                    await self?.refreshPendingCount()
                }
            }
            .store(in: &cancellables)
    }

    /// Must be called after the SwiftData ModelContext is available (e.g. from
    /// the App's body or the first View `.onAppear`).
    func configure(with context: ModelContext) {
        self.modelContext = context
        Task { @MainActor in
            await refreshPendingCount()
        }
    }

    // MARK: - Recording transactions

    /// Records a cash sale locally and immediately attempts to sync if online.
    func recordCashSale(
        productIds: [Int],
        allowHidden: Bool,
        priceOverrides: [String: Int],
        customItems: [CustomLineItemRequest],
        totalRappen: Int,
        itemCount: Int
    ) async throws -> UUID {
        let payload = PendingTransactionPayload(
            productIds: productIds,
            priceOverrides: priceOverrides,
            customItems: customItems.map { CustomItemPayload(name: $0.name, priceRappen: $0.priceRappen) },
            paymentMethod: "cash",
            allowHidden: allowHidden
        )
        let tx = PendingTransactionModel(
            transactionType: "cash",
            payloadJson: PendingTransactionSerializer.toJson(payload),
            totalRappen: totalRappen,
            displayLabel: "\(itemCount) items - Cash"
        )

        modelContext?.insert(tx)
        try? modelContext?.save()
        await refreshPendingCount()

        if networkMonitor.isCurrentlyOnline {
            _ = await syncTransaction(tx)
        }
        return tx.localId
    }

    /// Records a card-payment backend confirmation that failed after the
    /// card was already charged by Stripe. Queued for later sync.
    func recordCardBackendConfirm(
        paymentIntentId: String,
        posOrderId: Int,
        totalRappen: Int,
        itemCount: Int
    ) async -> UUID {
        let payload = PendingTransactionPayload(
            paymentMethod: "card",
            paymentIntentId: paymentIntentId,
            posOrderId: posOrderId
        )
        let tx = PendingTransactionModel(
            transactionType: "card_backend_confirm",
            payloadJson: PendingTransactionSerializer.toJson(payload),
            totalRappen: totalRappen,
            displayLabel: "\(itemCount) items - Card (confirm)"
        )

        modelContext?.insert(tx)
        try? modelContext?.save()
        await refreshPendingCount()

        if networkMonitor.isCurrentlyOnline {
            _ = await syncTransaction(tx)
        }
        return tx.localId
    }

    /// Records a TWINT backend confirmation that failed after the customer
    /// already paid. Queued for later sync.
    func recordTwintBackendConfirm(
        paymentIntentId: String,
        posOrderId: Int,
        totalRappen: Int,
        itemCount: Int
    ) async -> UUID {
        let payload = PendingTransactionPayload(
            paymentMethod: "twint",
            paymentIntentId: paymentIntentId,
            posOrderId: posOrderId
        )
        let tx = PendingTransactionModel(
            transactionType: "twint",
            payloadJson: PendingTransactionSerializer.toJson(payload),
            totalRappen: totalRappen,
            displayLabel: "\(itemCount) items - TWINT (confirm)"
        )

        modelContext?.insert(tx)
        try? modelContext?.save()
        await refreshPendingCount()

        if networkMonitor.isCurrentlyOnline {
            _ = await syncTransaction(tx)
        }
        return tx.localId
    }

    // MARK: - Sync

    /// Attempts to sync a single pending transaction. Returns true on success.
    func syncTransaction(_ tx: PendingTransactionModel) async -> Bool {
        tx.status = "syncing"
        try? modelContext?.save()

        do {
            let payload = PendingTransactionSerializer.fromJson(tx.payloadJson)
            switch tx.transactionType {
            case "cash":
                let _ = try await ApiService.shared.manualSale(
                    productIds: payload.productIds,
                    paymentMethod: "cash",
                    // Replaying without this is why a queued sale of a hidden
                    // piece came back 409 "no longer available" forever.
                    allowHidden: payload.allowHidden,
                    priceOverrides: payload.priceOverrides,
                    customItems: payload.customItems.map {
                        CustomLineItemRequest(name: $0.name, priceRappen: $0.priceRappen)
                    }
                )
            case "card_backend_confirm":
                guard let piId = payload.paymentIntentId else {
                    throw NSError(domain: "OfflinePayment", code: 1, userInfo: [NSLocalizedDescriptionKey: "Missing paymentIntentId"])
                }
                let _ = try await ApiService.shared.confirmSale(
                    posOrderId: payload.posOrderId ?? 0,
                    paymentIntentId: piId
                )
            case "twint":
                guard let piId = payload.paymentIntentId else {
                    throw NSError(domain: "OfflinePayment", code: 2, userInfo: [NSLocalizedDescriptionKey: "Missing paymentIntentId"])
                }
                let _ = try await ApiService.shared.confirmSale(
                    posOrderId: payload.posOrderId ?? 0,
                    paymentIntentId: piId
                )
            default:
                throw NSError(domain: "OfflinePayment", code: 3, userInfo: [NSLocalizedDescriptionKey: "Unknown transaction type: \(tx.transactionType)"])
            }

            tx.status = "synced"
            try? modelContext?.save()
            await refreshPendingCount()
            return true
        } catch {
            tx.status = "failed"
            tx.lastError = error.localizedDescription
            tx.retryCount += 1
            try? modelContext?.save()
            await refreshPendingCount()
            return false
        }
    }

    /// Retries all pending/failed transactions. Returns the number synced.
    func syncAllPending() async -> Int {
        guard let context = modelContext else { return 0 }
        let descriptor = FetchDescriptor<PendingTransactionModel>(
            predicate: #Predicate { $0.status == "pending" || $0.status == "failed" }
        )
        guard let pending = try? context.fetch(descriptor) else { return 0 }
        if pending.isEmpty { return 0 }

        var successCount = 0
        for tx in pending {
            if await syncTransaction(tx) { successCount += 1 }
        }
        await cleanupSynced()
        await refreshPendingCount()
        return successCount
    }

    /// Removes all "synced" transactions from the local store.
    func cleanupSynced() async {
        guard let context = modelContext else { return }
        let descriptor = FetchDescriptor<PendingTransactionModel>(
            predicate: #Predicate { $0.status == "synced" }
        )
        guard let synced = try? context.fetch(descriptor) else { return }
        for tx in synced {
            context.delete(tx)
        }
        try? context.save()
    }

    // MARK: - Internal

    private func refreshPendingCount() async {
        guard let context = modelContext else { return }
        let descriptor = FetchDescriptor<PendingTransactionModel>(
            predicate: #Predicate { $0.status == "pending" || $0.status == "failed" }
        )
        let count = (try? context.fetchCount(descriptor)) ?? 0
        pendingCount = count
    }
}
