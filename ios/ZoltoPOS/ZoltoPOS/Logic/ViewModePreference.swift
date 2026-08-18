import Foundation

/// How the product picker lays out stock.
enum ProductViewMode: String, CaseIterable, Identifiable {
    case grid = "Grid"
    case list = "List"

    var id: String { rawValue }
}

/// Which layout the picker opens in, and how a cashier's choice survives a
/// restart.
///
/// The list is the default: it is the only shape in which a full product name
/// fits on screen, and the name is what a cashier reads to tell two similar
/// pieces apart. The grid stays available for merchants who recognise stock by
/// its photograph — the choice is per-device and sticky, because a cashier who
/// re-picks a layout every morning is being asked the same question twice.
enum ViewModePreference {
    static let storageKey = "pos.productViewMode"
    static let defaultMode: ProductViewMode = .list

    /// Maps a stored raw value onto a layout, falling back to the default for
    /// a first run, a blank, or anything written by an older build.
    static func resolve(stored: String?) -> ProductViewMode {
        guard let stored, !stored.isEmpty else { return defaultMode }
        if let exact = ProductViewMode(rawValue: stored) { return exact }
        // Tolerate case drift ("list", "LIST") so a value round-tripped
        // through another store still reads back.
        return ProductViewMode.allCases.first { $0.rawValue.lowercased() == stored.lowercased() }
            ?? defaultMode
    }
}
