import Foundation

/// Pure logic for the first-run pairing flow: normalising the server URL,
/// validating a typed POS API key, and extracting credentials from a scanned
/// QR code. Kept free of UIKit/Keychain so it is unit-testable.
enum Pairing {
    static let defaultBaseURL = "https://zolto.ch"

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

    /// Extracts credentials from a scanned QR payload. Accepted forms:
    /// - the bare key itself (what "Keys & access" shows today)
    /// - a URL with `key`/`posKey` (and optionally `url`/`server`/`baseUrl`)
    ///   query items, e.g. `zolto://pair?key=abc&url=https://zolto.ch`
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
