import Foundation

/// Pure, UI-free combined search + category filtering.
///
/// The single search box matches across every product field (name, category,
/// description, price — supplied via `searchableTextOf`). Search is global: a
/// non-blank query searches the whole catalog regardless of the selected
/// category chip, so a piece is findable even while browsing another category.
/// A blank query falls back to browsing the selected category.
enum ProductQuery {

    /// Splits a raw query into lowercase tokens for AND matching.
    static func tokens(_ query: String) -> [String] {
        query.lowercased()
            .split(whereSeparator: { $0.isWhitespace })
            .map(String.init)
    }

    /// True if every token appears somewhere in the item's searchable text.
    static func matches<T>(_ item: T, tokens: [String], searchableTextOf: (T) -> String) -> Bool {
        if tokens.isEmpty { return true }
        let hay = searchableTextOf(item).lowercased()
        return tokens.allSatisfy { hay.contains($0) }
    }

    static func apply<T>(
        _ items: [T],
        categoryOf: (T) -> String?,
        searchableTextOf: (T) -> String,
        category: String,
        query: String,
        extraIncludes: [String: [String]]
    ) -> [T] {
        let toks = tokens(query)
        let base = toks.isEmpty
            ? CategoryFilter.filter(items, categoryOf: categoryOf, category: category, extraIncludes: extraIncludes)
            : items
        return base.filter { matches($0, tokens: toks, searchableTextOf: searchableTextOf) }
    }
}
