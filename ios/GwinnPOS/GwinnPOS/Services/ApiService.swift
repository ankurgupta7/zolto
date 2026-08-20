import Foundation

enum ApiError: LocalizedError, Equatable {
    case notConfigured
    case invalidURL(String)
    case noData
    case decodingError(String)
    /// The server rejected the stored POS API key — it was rotated or revoked.
    /// Routed back to the pairing screen by StoreSession.
    case unauthorized
    case serverError(status: Int, message: String)
    case network(String)

    var errorDescription: String? {
        switch self {
        case .notConfigured:
            return "This device isn't paired with a store yet. Scan or enter your store's POS API key to get started."
        case .invalidURL(let url):
            return "The server URL is not valid: \(url)"
        case .noData:
            return "The server returned no data."
        case .decodingError(let detail):
            return "Could not read the server response. \(detail)"
        case .unauthorized:
            return "The store rejected this device's POS key \u{2014} it may have been rotated or revoked. Re-pair with a current key from Admin \u{2192} Keys & access."
        case .serverError(let status, let message):
            switch status {
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

extension Notification.Name {
    /// Posted whenever the server answers 401 to the stored key. StoreSession
    /// listens and routes the app back to the pairing screen.
    static let posKeyRejected = Notification.Name("ch.gwinn.pos.keyRejected")
}

class ApiService {
    static let shared = ApiService()

    private let store: SecureStore

    private enum StoreKey {
        static let baseURL = "pos_base_url"
        static let apiKey = "pos_api_key"
    }

    var baseURL: String {
        get { store.get(StoreKey.baseURL) ?? Pairing.defaultBaseURL }
        set { store.set(StoreKey.baseURL, to: newValue.trimmingCharacters(in: .whitespacesAndNewlines)) }
    }

    var apiKey: String {
        get { store.get(StoreKey.apiKey) ?? "" }
        set { store.set(StoreKey.apiKey, to: newValue.trimmingCharacters(in: .whitespacesAndNewlines)) }
    }

    var isConfigured: Bool { !apiKey.isEmpty }

    /// `seedFromEnvironment` pulls in legacy UserDefaults credentials and the
    /// build-time Info.plist seed. Tests pass `false` so the host app's
    /// injected CI key can't leak into credential assertions.
    init(store: SecureStore = KeychainStore(), seedFromEnvironment: Bool = true) {
        self.store = store
        guard seedFromEnvironment else { return }

        // One-time migration: earlier builds kept the credentials in
        // UserDefaults. Move them into the Keychain and scrub the old copies.
        let defaults = UserDefaults.standard
        if store.get(StoreKey.apiKey) == nil,
           let legacyKey = defaults.string(forKey: StoreKey.apiKey), !legacyKey.isEmpty {
            store.set(StoreKey.apiKey, to: legacyKey)
            if store.get(StoreKey.baseURL) == nil,
               let legacyURL = defaults.string(forKey: StoreKey.baseURL), !legacyURL.isEmpty {
                store.set(StoreKey.baseURL, to: legacyURL)
            }
        }
        defaults.removeObject(forKey: StoreKey.apiKey)
        defaults.removeObject(forKey: StoreKey.baseURL)

        // Build-time Info.plist seed so Appetize/CI builds need no manual
        // pairing. POS_API_KEY / POS_BASE_URL are injected via xcodebuild
        // settings; a fresh install pairs interactively instead.
        if store.get(StoreKey.apiKey) == nil {
            if let key = Bundle.main.object(forInfoDictionaryKey: "POS_API_KEY") as? String,
               let trimmed = Pairing.normalizeKey(key) {
                store.set(StoreKey.apiKey, to: trimmed)
            }
        }
        if store.get(StoreKey.baseURL) == nil {
            if let url = Bundle.main.object(forInfoDictionaryKey: "POS_BASE_URL") as? String,
               let normalized = Pairing.normalizeBaseURL(url) {
                store.set(StoreKey.baseURL, to: normalized)
            }
        }
    }

    func configure(baseURL: String, apiKey: String) {
        self.baseURL = baseURL
        self.apiKey = apiKey
    }

    /// Unpair: forget this device's credentials entirely.
    func clearCredentials() {
        store.remove(StoreKey.apiKey)
        store.remove(StoreKey.baseURL)
    }

    private static func buildRequest(
        baseURL: String,
        apiKey: String,
        path: String,
        method: String,
        body: Data?
    ) throws -> URLRequest {
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
        return request
    }

    private static func send<T: Codable>(_ request: URLRequest) async throws -> T {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            // Surface the system message (e.g. "The network connection was lost.")
            throw ApiError.network(error.localizedDescription)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ApiError.noData
        }
        if httpResponse.statusCode == 401 {
            throw ApiError.unauthorized
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

    private func request<T: Codable>(path: String, method: String = "GET", body: Data? = nil) async throws -> T {
        // Fail fast with a clear message instead of sending an empty key.
        guard isConfigured else { throw ApiError.notConfigured }
        let req = try Self.buildRequest(
            baseURL: baseURL, apiKey: apiKey, path: path, method: method, body: body
        )
        do {
            return try await Self.send(req)
        } catch ApiError.unauthorized {
            // The stored key no longer works — tell the session so the app
            // routes back to pairing with a clear message. Credentials stay
            // stored (a transient server misconfig must not wipe the pairing).
            NotificationCenter.default.post(name: .posKeyRejected, object: nil)
            throw ApiError.unauthorized
        }
    }

    /// Redeems a one-tap pairing token for the store's POS key.
    ///
    /// The only call that deliberately sends no `x-pos-key`: this is how a
    /// register with no key gets one. The token is single-use, so this must be
    /// called exactly once per link — a retry will be refused by the server.
    ///
    /// Nothing is saved here; the caller probes the returned key and then hands
    /// it to StoreSession, so a key that doesn't actually work never replaces a
    /// working pairing.
    static func redeemPairing(baseURL: String, token: String) async throws -> PairingRedemption {
        var req = try buildRequest(
            baseURL: baseURL, apiKey: "", path: "api/pos/pair", method: "POST",
            body: try JSONEncoder().encode(["token": token])
        )
        // buildRequest always sets x-pos-key; strip it so an unpaired device
        // isn't sending an empty credential.
        req.setValue(nil, forHTTPHeaderField: "x-pos-key")
        return try await send(req)
    }

    /// Validates candidate credentials during pairing WITHOUT saving them and
    /// without posting `.posKeyRejected`. Returns the store's config (identity
    /// included) so the pairing screen can greet the store by name.
    static func probe(baseURL: String, apiKey: String) async throws -> PosConfigResponse {
        let req = try buildRequest(
            baseURL: baseURL, apiKey: apiKey, path: "api/pos/config", method: "GET", body: nil
        )
        return try await send(req)
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
        // Tap to Pay tokens are minted on the tenant's connected Stripe
        // account — same endpoint path the Android app uses.
        return try await request(path: "api/pos/terminal/connection-token", method: "POST")
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
        allowHidden: Bool = false,
        priceOverrides: [String: Int] = [:],
        customItems: [CustomLineItemRequest] = []
    ) async throws -> ManualSaleResponse {
        let body = try JSONEncoder().encode(ManualSaleRequest(
            productIds: productIds,
            paymentMethod: paymentMethod,
            allowHidden: allowHidden,
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
