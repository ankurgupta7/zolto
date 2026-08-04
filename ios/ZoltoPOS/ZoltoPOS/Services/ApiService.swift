import Foundation

enum ApiError: LocalizedError {
    case notConfigured
    case invalidURL(String)
    case noData
    case decodingError(String)
    case serverError(status: Int, message: String)
    case network(String)

    var errorDescription: String? {
        switch self {
        case .notConfigured:
            return "No POS API key set. Tap \u{201C}Configure Backend\u{201D} and enter your server URL and POS API key."
        case .invalidURL(let url):
            return "The server URL is not valid: \(url)"
        case .noData:
            return "The server returned no data."
        case .decodingError(let detail):
            return "Could not read the server response. \(detail)"
        case .serverError(let status, let message):
            switch status {
            case 401:
                return "Unauthorized (401). The POS API key is missing or incorrect."
            case 404:
                return "Not found (404). Check the server URL \u{2014} the /api/pos route was not found."
            case 503:
                return "Server unavailable (503). \(message)"
            default:
                return "Server error (\(status)). \(message)"
            }
        case .network(let detail):
            return "Network error: \(detail)"
        }
    }
}

class ApiService {
    static let shared = ApiService()

    var baseURL: String {
        get { UserDefaults.standard.string(forKey: "pos_base_url") ?? "https://kalakosh.ch" }
        set { UserDefaults.standard.set(newValue.trimmingCharacters(in: .whitespacesAndNewlines), forKey: "pos_base_url") }
    }

    var apiKey: String {
        get { UserDefaults.standard.string(forKey: "pos_api_key") ?? "" }
        set { UserDefaults.standard.set(newValue.trimmingCharacters(in: .whitespacesAndNewlines), forKey: "pos_api_key") }
    }

    var isConfigured: Bool { !apiKey.isEmpty }

    private init() {
        // On first launch seed UserDefaults from build-time Info.plist values so
        // Appetize (and fresh installs) need no manual clipboard paste.
        // POS_API_KEY / POS_BASE_URL are injected at build time (GitHub Actions /
        // Codemagic) via xcodebuild settings and substituted into Info.plist.
        let defaults = UserDefaults.standard
        if defaults.string(forKey: "pos_api_key") == nil {
            if let key = Bundle.main.object(forInfoDictionaryKey: "POS_API_KEY") as? String {
                let trimmed = key.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty { defaults.set(trimmed, forKey: "pos_api_key") }
            }
        }
        if defaults.string(forKey: "pos_base_url") == nil {
            if let url = Bundle.main.object(forInfoDictionaryKey: "POS_BASE_URL") as? String {
                let trimmed = url.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty { defaults.set(trimmed, forKey: "pos_base_url") }
            }
        }
    }

    func configure(baseURL: String, apiKey: String) {
        self.baseURL = baseURL
        self.apiKey = apiKey
    }

    private func request<T: Codable>(path: String, method: String = "GET", body: Data? = nil) async throws -> T {
        // Fail fast with a clear message instead of sending an empty key.
        guard isConfigured else { throw ApiError.notConfigured }

        // Trim and normalise so a stray space/newline can't produce a nil URL.
        let base = baseURL.trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let urlString = "\(base)/\(path)"
        guard let url = URL(string: urlString) else {
            throw ApiError.invalidURL(urlString)
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.addValue(apiKey, forHTTPHeaderField: "x-pos-key")

        if let body = body {
            request.httpBody = body
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            // Surface the system message (e.g. \"The network connection was lost.\")
            throw ApiError.network(error.localizedDescription)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ApiError.noData
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? "Unknown server error"
            throw ApiError.serverError(status: httpResponse.statusCode, message: message)
        }

        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw ApiError.decodingError(error.localizedDescription)
        }
    }

    // includeHidden lets the cashier's "Show Hidden Items" toggle
    // (ProductViewModel.showHiddenItems) opt into seeing products an admin
    // has hidden from the default storefront view.
    func getProducts(includeHidden: Bool = false) async throws -> [Product] {
        let path = includeHidden ? "api/pos/products?includeHidden=true" : "api/pos/products"
        return try await request(path: path)
    }

    func getCategories() async throws -> CategoriesResponse {
        return try await request(path: "api/pos/categories")
    }

    func getConfig() async throws -> PosConfigResponse {
        return try await request(path: "api/pos/config")
    }

    func getConnectionToken() async throws -> ConnectionTokenResponse {
        return try await request(path: "api/pos/connection-token", method: "POST")
    }

    func createPaymentIntent(
        productIds: [Int],
        allowHidden: Bool = false,
        priceOverrides: [String: Int] = [:],
        customItems: [CustomLineItemRequest] = []
    ) async throws -> PaymentIntentResponse {
        let body = try JSONEncoder().encode(PaymentIntentRequest(
            productIds: productIds,
            allowHidden: allowHidden,
            priceOverrides: priceOverrides,
            customItems: customItems
        ))
        return try await request(path: "api/pos/payment-intent", method: "POST", body: body)
    }

    func confirmSale(posOrderId: Int, paymentIntentId: String) async throws -> SaleResponse {
        let body = try JSONEncoder().encode(SaleRequest(posOrderId: posOrderId, paymentIntentId: paymentIntentId))
        return try await request(path: "api/pos/sale", method: "POST", body: body)
    }

    /// Records a cash sale directly — no Stripe PaymentIntent involved.
    func manualSale(
        productIds: [Int],
        paymentMethod: String,
        priceOverrides: [String: Int] = [:],
        customItems: [CustomLineItemRequest] = []
    ) async throws -> ManualSaleResponse {
        let body = try JSONEncoder().encode(ManualSaleRequest(
            productIds: productIds,
            paymentMethod: paymentMethod,
            priceOverrides: priceOverrides,
            customItems: customItems
        ))
        return try await request(path: "api/pos/manual-sale", method: "POST", body: body)
    }

    /// Starts a TWINT payment through Stripe and returns the redirect URL to
    /// render as a QR code. See TwintIntentResponse.
    func twintIntent(
        productIds: [Int],
        allowHidden: Bool = false,
        priceOverrides: [String: Int] = [:],
        customItems: [CustomLineItemRequest] = []
    ) async throws -> TwintIntentResponse {
        let body = try JSONEncoder().encode(TwintIntentRequest(
            productIds: productIds,
            allowHidden: allowHidden,
            priceOverrides: priceOverrides,
            customItems: customItems
        ))
        return try await request(path: "api/pos/twint-intent", method: "POST", body: body)
    }

    func getSalesHistory() async throws -> [SaleSummary] {
        return try await request(path: "api/pos/sales")
    }
}
