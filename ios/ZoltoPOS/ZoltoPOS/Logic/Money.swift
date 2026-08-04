import Foundation

/// Shared CHF <-> Rappen conversion for cashier-entered amounts (bargained
/// price overrides, custom item prices) — the one place that decides what
/// counts as a valid amount typed into a text field.
enum Money {
    /// Parses a cashier-entered CHF amount (accepting either `.` or `,` as the
    /// decimal separator) into Rappen, rounding to the nearest Rappen. Returns
    /// `nil` for blank, non-numeric, or negative input.
    static func parseChfToRappen(_ text: String) -> Int? {
        let normalized = text.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
        guard !normalized.isEmpty, let value = Double(normalized), value >= 0 else { return nil }
        return Int((value * 100).rounded())
    }

    static func chfString(_ rappen: Int) -> String {
        String(format: "%.2f", Double(rappen) / 100.0)
    }
}
