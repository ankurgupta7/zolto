import Foundation
import SwiftData

/// Represents a sale transaction recorded while offline and waiting to be
/// synced to the backend.
///
/// Stored in SwiftData alongside [ProductModel] and [SaleModel]. The
/// [OfflinePaymentManager] creates these when a direct API call fails and
/// retries them when connectivity returns.
@Model
class PendingTransactionModel {
    /// Auto-generated local id — not the server's posOrderId.
    @Attribute(.unique) var localId: UUID
    /// One of: "cash", "card_backend_confirm", "twint".
    var transactionType: String
    /// JSON-encoded request payload.
    var payloadJson: String
    /// ISO-8601 timestamp of when the sale was recorded locally.
    var createdAt: String
    /// Number of sync retry attempts so far.
    var retryCount: Int
    /// "pending", "syncing", "failed", or "synced".
    var status: String
    /// Human-readable error from the last failed sync attempt.
    var lastError: String?
    /// The local sale total in Rappen — shown in the UI while pending.
    var totalRappen: Int
    /// A display label for the UI, e.g. "3 items - Cash".
    var displayLabel: String

    init(
        transactionType: String,
        payloadJson: String,
        totalRappen: Int,
        displayLabel: String,
        status: String = "pending",
        retryCount: Int = 0,
        lastError: String? = nil
    ) {
        self.localId = UUID()
        self.transactionType = transactionType
        self.payloadJson = payloadJson
        self.createdAt = ISO8601DateFormatter().string(from: Date())
        self.totalRappen = totalRappen
        self.displayLabel = displayLabel
        self.status = status
        self.retryCount = retryCount
        self.lastError = lastError
    }
}

// MARK: - Payload Codables

/// Serializable payload stored in [PendingTransactionModel.payloadJson].
struct PendingTransactionPayload: Codable {
    var productIds: [Int] = []
    var priceOverrides: [String: Int] = [:]
    var customItems: [CustomItemPayload] = []
    var paymentMethod: String = "cash"
    var paymentIntentId: String? = nil
    var posOrderId: Int? = nil
    var allowHidden: Bool = false
}

struct CustomItemPayload: Codable {
    var name: String
    var priceRappen: Int
}

// MARK: - Serializer

enum PendingTransactionSerializer {
    static func toJson(_ payload: PendingTransactionPayload) -> String {
        let data = try! JSONEncoder().encode(payload)
        return String(data: data, encoding: .utf8)!
    }

    static func fromJson(_ json: String) -> PendingTransactionPayload {
        let data = json.data(using: .utf8)!
        return try! JSONDecoder().decode(PendingTransactionPayload.self, from: data)
    }
}
