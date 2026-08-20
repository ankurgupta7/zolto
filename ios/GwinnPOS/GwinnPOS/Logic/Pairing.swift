import Foundation

/// Pure logic for the first-run pairing flow: normalising the server URL,
/// validating a typed POS API key, and extracting credentials from a scanned
/// QR code. Kept free of UIKit/Keychain so it is unit-testable.
enum Pairing {
    static let defaultBaseURL = "https://gwinn.ch"

    /// What a pairing input (typed or scanned) resolves to.
    struct Credentials: Equatable {
        var apiKey: String
        /// Only present when the QR payload carries a server URL too.
        var baseURL: String?
    }

    /// Normalises a merchant-entered server URL: trims whitespace, defaults
    /// the scheme to https, strips trailing slashes. Returns nil for input
    /// that can't become a usable absolute URL.
    static func normalizeBaseURL(_ input: String) -> String? {
        var s = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.isEmpty { return nil }
        if !s.contains("://") { s = "https://" + s }
        while s.hasSuffix("/") { s.removeLast() }
        guard let url = URL(string: s),
              let scheme = url.scheme?.lowercased(),
              scheme == "https" || scheme == "http",
              let host = url.host, !host.isEmpty
        else { return nil }
        return s
    }

    /// A plausible POS API key: non-empty, single token, no whitespace. The
    /// server issues 64-char hex keys today, but the app stays lenient so key
    /// format changes never require an app update.
    static func normalizeKey(_ input: String) -> String? {
        let s = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !s.isEmpty, s.rangeOfCharacter(from: .whitespacesAndNewlines) == nil else {
            return nil
        }
        return s
    }

    /// A one-tap pairing link's contents: an opaque token plus the server to
    /// redeem it against.
    struct PairingLink: Equatable {
        /// Single-use, minutes-long. Exchanged for the real key at
        /// POST /api/pos/pair — it is not itself a POS key.
        var token: String
        /// Where to redeem. Present in every link the admin mints, since a fresh
        /// install knows no host; falls back to `defaultBaseURL` when absent.
        var baseURL: String
    }

    /// Parses a deep link the merchant tapped in their admin:
    /// `gwinn://pair?t=<token>&url=https://their-store.gwinn.ch`
    ///
    /// Kept separate from `parseQrPayload` because the two carry different
    /// things: a QR payload embeds the POS key itself, while this carries only a
    /// redeemable token. Conflating them would let a `key=` link masquerade as a
    /// pairing token and vice versa.
    static func parsePairingLink(_ url: URL) -> PairingLink? {
        guard url.scheme?.lowercased() == "gwinn" else { return nil }
        // `gwinn://pair?…` puts "pair" in the host; a stray `gwinn:/pair?…`
        // puts it in the path. Accept either rather than failing on a form the
        // OS may hand us.
        let action = (url.host ?? url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/")))
            .lowercased()
        guard action == "pair" else { return nil }

        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return nil
        }
        let items = components.queryItems ?? []
        let rawToken = items.first { ["t", "token"].contains($0.name.lowercased()) }?.value
        guard let rawToken, let token = normalizeKey(rawToken) else { return nil }

        let rawURL = items.first {
            ["url", "server", "baseurl", "base_url"].contains($0.name.lowercased())
        }?.value
        let baseURL = rawURL.flatMap(normalizeBaseURL) ?? defaultBaseURL
        return PairingLink(token: token, baseURL: baseURL)
    }

    /// Extracts credentials from a scanned QR payload. Accepted forms:
    /// - the bare key itself (what "Keys & access" shows today)
    /// - a URL with `key`/`posKey` (and optionally `url`/`server`/`baseUrl`)
    ///   query items, e.g. `gwinn://pair?key=abc&url=https://gwinn.ch`
    /// - a JSON object with `key`/`posKey` (+ optional `url`/`baseUrl`)
    static func parseQrPayload(_ payload: String) -> Credentials? {
        let trimmed = payload.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return nil }

        // JSON form
        if trimmed.hasPrefix("{"), let data = trimmed.data(using: .utf8),
           let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] {
            let key = (obj["posKey"] ?? obj["key"]) as? String
            let url = (obj["baseUrl"] ?? obj["url"] ?? obj["server"]) as? String
            guard let key, let normalizedKey = normalizeKey(key) else { return nil }
            return Credentials(apiKey: normalizedKey, baseURL: url.flatMap(normalizeBaseURL))
        }

        // URL form — anything with query items wins; a plain URL is not a key.
        if trimmed.contains("://"),
           let components = URLComponents(string: trimmed) {
            let items = components.queryItems ?? []
            let key = items.first { ["key", "poskey", "pos_key"].contains($0.name.lowercased()) }?.value
            let url = items.first { ["url", "server", "baseurl", "base_url"].contains($0.name.lowercased()) }?.value
            if let key, let normalizedKey = normalizeKey(key) {
                return Credentials(apiKey: normalizedKey, baseURL: url.flatMap(normalizeBaseURL))
            }
            return nil
        }

        // Bare key
        guard let key = normalizeKey(trimmed) else { return nil }
        return Credentials(apiKey: key, baseURL: nil)
    }
}
