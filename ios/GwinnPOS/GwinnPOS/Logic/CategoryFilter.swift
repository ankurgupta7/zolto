import Foundation

/// Pure category-filtering logic — no UI, no hard-coded category names. The
/// canonical category order and the "extra includes" map (e.g. Sets fold into
/// Necklaces/Earrings) both come from the website via `GET /api/pos/categories`,
/// so the POS app never re-types a category string.
///
/// Mirrors the website shop: the filter bar shows "All" plus only the categories
/// that actually have products (empty categories hidden), in canonical order.
enum CategoryFilter {

    /// Sentinel chip that shows every product; not a real product category.
    static let all = "All"

    /// The category chips to display: `all` first, then every canonical category
    /// that at least one loaded product belongs to, in canonical order.
    ///
    /// - Parameters:
    ///   - canonicalOrder: ordered category list from the server.
    ///   - present: the set of categories present on the loaded products.
    static func visibleCategories(canonicalOrder: [String], present: Set<String>) -> [String] {
        // Fall back to the present categories if the server list is unavailable,
        // so the bar still hides empty categories offline.
        let ordered = canonicalOrder.isEmpty
            ? Array(present)
            : canonicalOrder.filter { present.contains($0) }
        return [all] + ordered
    }

    /// Items belonging to `category`, folding in any `extraIncludes` targets
    /// (e.g. selecting Necklaces also shows Sets). `all` returns everything.
    static func filter<T>(
        _ items: [T],
        categoryOf: (T) -> String?,
        category: String,
        extraIncludes: [String: [String]]
    ) -> [T] {
        if category == all { return items }
        let folded = extraIncludes[category] ?? []
        return items.filter { item in
            guard let c = categoryOf(item) else { return false }
            return c == category || folded.contains(c)
        }
    }
}
