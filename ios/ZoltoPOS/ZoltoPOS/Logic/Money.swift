import Foundation

/// Shared money handling for cashier-entered amounts (bargained price
/// overrides, custom item prices) and price display — the one place that
/// decides what counts as a valid typed amount, and which currency label the
/// paired store uses.
///
/// Amounts are stored in minor units throughout ("Rappen" in the field names,
/// kept for wire compatibility with the server, which resolves everything in
/// minor units regardless of currency).
enum Money {
    static let defaultCurrencyCode = "chf"

    /// The paired store's currency, set from `/api/pos/config` by
    /// StoreSession. Stored lowercase as served; displayed uppercased.
    static var currencyCode: String = defaultCurrencyCode

    /// "CHF", "EUR", … — what price labels show.
    static var displayCurrency: String {
        let trimmed = currencyCode.trimmingCharacters(in: .whitespacesAndNewlines)
        return (trimmed.isEmpty ? defaultCurrencyCode : trimmed).uppercased()
    }

    /// Parses a cashier-entered amount (accepting either `.` or `,` as the
    /// decimal separator) into minor units, rounding to the nearest unit.
    /// Returns `nil` for blank, non-numeric, or negative input.
    static func parseChfToRappen(_ text: String) -> Int? {
        let normalized = text.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
        guard !normalized.isEmpty, let value = Double(normalized), value >= 0 else { return nil }
        return Int((value * 100).rounded())
    }

    /// Bare amount, e.g. "12.50" — no currency label.
    static func chfString(_ rappen: Int) -> String {
        String(format: "%.2f", Double(rappen) / 100.0)
    }

    /// Full price label in the paired store's currency, e.g. "CHF 12.50".
    static func label(_ rappen: Int) -> String {
        "\(displayCurrency) \(chfString(rappen))"
    }
}
