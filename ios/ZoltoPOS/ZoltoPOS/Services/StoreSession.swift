import Foundation
import Combine

/// The paired store's identity, served by `GET /api/pos/config`. The app
/// chrome stays neutral Zolto; everything store-specific (name, logo,
/// currency) comes from here at runtime.
struct StoreIdentity: Codable, Equatable {
    var storeName: String
    var logoUrl: String?
    /// Lowercase ISO code as served (e.g. "chf"); use `Money` for display.
    var currency: String
}

/// App-wide pairing state: whether this device holds working credentials for
/// a store, and that store's identity. Owns the "key was rotated → back to
/// pairing" routing so every screen doesn't have to.
@MainActor
final class StoreSession: ObservableObject {
    static let shared = StoreSession()

    @Published var isPaired: Bool
    @Published var identity: StoreIdentity?
    /// Shown on the pairing screen when re-pairing was forced (e.g. rotated key).
    @Published var pairingMessage: String?

    private let api: ApiService
    private static let identityCacheKey = "store_identity_cache"
    private var keyRejectedObserver: NSObjectProtocol?

    init(api: ApiService = .shared) {
        self.api = api
        self.isPaired = api.isConfigured

        // Cached identity (non-secret) so the store's name shows immediately
        // on launch, before — or without — a network round-trip.
        if let data = UserDefaults.standard.data(forKey: Self.identityCacheKey),
           let cached = try? JSONDecoder().decode(StoreIdentity.self, from: data) {
            self.identity = cached
            Money.currencyCode = cached.currency
        }

        keyRejectedObserver = NotificationCenter.default.addObserver(
            forName: .posKeyRejected, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.requireRepairing(
                    message: "This device's POS key was rejected \u{2014} it may have been rotated or revoked. Pair again with a current key from your admin's Keys & access page."
                )
            }
        }
    }

    /// Pulls the store identity from the server and caches it. Best-effort:
    /// failures keep whatever identity we already have.
    func refreshIdentity() async {
        guard api.isConfigured else { return }
        guard let config = try? await api.getConfig() else { return }
        apply(config: config)
    }

    /// Redeem a one-tap pairing link the merchant tapped in their admin.
    ///
    /// Order matters: redeem, then probe the key we got, and only persist once
    /// the probe succeeds — so a key that doesn't actually work never replaces a
    /// pairing that does. The token is single-use, so a failure here means the
    /// merchant needs a fresh link rather than a retry, and the message says so.
    func pair(with link: Pairing.PairingLink) async {
        pairingMessage = nil
        do {
            let redeemed = try await ApiService.redeemPairing(
                baseURL: link.baseURL, token: link.token
            )
            let config = try await ApiService.probe(
                baseURL: link.baseURL, apiKey: redeemed.apiKey
            )
            completePairing(baseURL: link.baseURL, apiKey: redeemed.apiKey, config: config)
        } catch {
            // Deliberately vague about the cause, mirroring the server: the link
            // is spent either way, so the only useful instruction is "get a new
            // one". Never include the token or the error's raw body.
            pairingMessage = "That pairing link didn't work \u{2014} it may have expired or already been used. Generate a new one from your store's Keys & access page."
            isPaired = ApiService.shared.isConfigured
        }
    }

    /// Called by the pairing screen after a successful probe: persist the
    /// credentials and adopt the store's identity.
    func completePairing(baseURL: String, apiKey: String, config: PosConfigResponse) {
        api.configure(baseURL: baseURL, apiKey: apiKey)
        apply(config: config)
        pairingMessage = nil
        isPaired = true
    }

    /// Force the pairing screen without dropping stored credentials — a
    /// transient server misconfig must not wipe a working pairing; the
    /// cashier can retry or re-enter a fresh key.
    func requireRepairing(message: String) {
        pairingMessage = message
        isPaired = false
    }

    /// Explicit "switch store / unpair": forget credentials and identity.
    func unpair() {
        api.clearCredentials()
        UserDefaults.standard.removeObject(forKey: Self.identityCacheKey)
        identity = nil
        Money.currencyCode = Money.defaultCurrencyCode
        pairingMessage = nil
        isPaired = false
    }

    private func apply(config: PosConfigResponse) {
        let newIdentity = StoreIdentity(
            storeName: config.storeName ?? identity?.storeName ?? "",
            logoUrl: config.logoUrl,
            currency: config.currency ?? identity?.currency ?? Money.defaultCurrencyCode
        )
        identity = newIdentity
        Money.currencyCode = newIdentity.currency
        if let data = try? JSONEncoder().encode(newIdentity) {
            UserDefaults.standard.set(data, forKey: Self.identityCacheKey)
        }
    }
}
