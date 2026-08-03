import Foundation

/// Response of `GET /api/pos/categories` — the canonical category list and the
/// "extra includes" fold map, both sourced from the website's shared/const.ts so
/// the app never hard-codes category names.
struct CategoriesResponse: Codable {
    let categories: [String]
    let extraIncludes: [String: [String]]

    init(categories: [String] = [], extraIncludes: [String: [String]] = [:]) {
        self.categories = categories
        self.extraIncludes = extraIncludes
    }
}

struct ConnectionTokenResponse: Codable {
    let secret: String
}

/// Response of `GET /api/pos/config` — non-secret client configuration served by
/// the backend so no Stripe config is baked into the app build. `locationId` is
/// the Stripe Terminal Location the Tap to Pay reader registers against; it is an
/// empty string until `STRIPE_LOCATION_ID` is set on the server, which the app
/// treats as "card payments not set up yet".
struct PosConfigResponse: Codable {
    let locationId: String

    init(locationId: String = "") {
        self.locationId = locationId
    }
}

/// A sale outside the catalogue entirely — no product row backs it.
struct CustomLineItemRequest: Codable {
    let name: String
    let priceRappen: Int
}

struct PaymentIntentRequest: Codable {
    let productIds: [Int]
    // Acknowledges the sale may include a product hidden from the default
    // storefront view (see ProductViewModel.showHiddenItems) so the backend
    // allows it through instead of rejecting a legitimate, intentional sale.
    let allowHidden: Bool
    // Bargained final price per product, in Rappen, keyed by product id
    // (as a string — JSON object keys are always strings). Only products the
    // cashier actually overrode from list price appear here.
    let priceOverrides: [String: Int]
    // Items sold outside the catalogue (no product row backs them).
    let customItems: [CustomLineItemRequest]

    init(
        productIds: [Int],
        allowHidden: Bool = false,
        priceOverrides: [String: Int] = [:],
        customItems: [CustomLineItemRequest] = []
    ) {
        self.productIds = productIds
        self.allowHidden = allowHidden
        self.priceOverrides = priceOverrides
        self.customItems = customItems
    }
}

struct PaymentIntentResponse: Codable, Equatable {
    let clientSecret: String
    let posOrderId: Int
    let totalRappen: Int
}

struct SaleRequest: Codable {
    let posOrderId: Int
    let paymentIntentId: String
}

struct SaleResponse: Codable {
    let success: Bool
    let message: String?
}

/// Cash is the only method that never creates a Stripe PaymentIntent — the
/// cashier takes the money in hand and this just records the sale + decrements
/// stock, same bookkeeping as the card flow. (Card uses Tap to Pay; TWINT uses
/// a real Stripe PaymentIntent — see TwintIntentResponse.)
struct ManualSaleRequest: Codable {
    let productIds: [Int]
    let paymentMethod: String // "cash"
    let priceOverrides: [String: Int]
    let customItems: [CustomLineItemRequest]

    init(
        productIds: [Int],
        paymentMethod: String,
        priceOverrides: [String: Int] = [:],
        customItems: [CustomLineItemRequest] = []
    ) {
        self.productIds = productIds
        self.paymentMethod = paymentMethod
        self.priceOverrides = priceOverrides
        self.customItems = customItems
    }
}

struct ManualSaleResponse: Codable {
    let success: Bool
    let posOrderId: Int
    let totalRappen: Int
}

/// TWINT goes through Stripe: the backend creates + confirms a `twint`
/// PaymentIntent and hands back the Stripe redirect URL, which the app renders
/// as a QR code for the customer to scan with their TWINT app. The app then
/// polls /pos/sale until the PaymentIntent succeeds.
struct TwintIntentRequest: Codable {
    let productIds: [Int]
    // Acknowledges the sale may include a product hidden from the default
    // storefront view (see ProductViewModel.showHiddenItems) so the backend
    // allows it through instead of rejecting a legitimate, intentional sale.
    let allowHidden: Bool
    let priceOverrides: [String: Int]
    let customItems: [CustomLineItemRequest]

    init(
        productIds: [Int],
        allowHidden: Bool = false,
        priceOverrides: [String: Int] = [:],
        customItems: [CustomLineItemRequest] = []
    ) {
        self.productIds = productIds
        self.allowHidden = allowHidden
        self.priceOverrides = priceOverrides
        self.customItems = customItems
    }
}

struct TwintIntentResponse: Codable {
    let redirectUrl: String
    let paymentIntentId: String
    let posOrderId: Int
    let totalRappen: Int
}

struct SaleItem: Codable, Identifiable {
    // Not decoded from the server — GET /api/pos/sales items have no id of
    // their own, and productId alone can't serve as one since custom
    // (non-inventory) items all share productId == nil.
    let id = UUID()
    // Null for a custom line item sold outside the catalogue.
    let productId: Int?
    // Resolved server-side: the product's name for catalogue items, or the
    // cashier-entered name for custom items.
    let productName: String
    let priceRappen: Int

    enum CodingKeys: String, CodingKey {
        case productId, productName, priceRappen
    }

    var displayName: String { productName }
}

struct SaleSummary: Codable, Identifiable {
    let id: Int
    let totalRappen: Int
    // Optional so older cached rows (from before this field existed) still
    // decode fine — Codable decodes a missing key as nil for Optionals.
    let paymentMethod: String?
    let createdAt: String
    let items: [SaleItem]

    var paymentMethodLabel: String {
        switch paymentMethod {
        case "cash": return "Cash"
        case "twint": return "TWINT"
        default: return "Card"
        }
    }

    var totalChf: String {
        return String(format: "%.2f", Double(totalRappen) / 100.0)
    }
    
    var itemsSummary: String {
        items.map { $0.displayName }.joined(separator: ", ")
    }
}
