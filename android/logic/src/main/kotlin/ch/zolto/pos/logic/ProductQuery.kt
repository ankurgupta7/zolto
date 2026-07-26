package ch.zolto.pos.logic

/**
 * Pure, dependency-free combined search + category filtering.
 *
 * The single search box matches across every product field (name, category,
 * description, price — supplied via [searchableTextOf]). Search is global: a
 * non-blank query searches the whole catalog regardless of the selected
 * category chip, so a piece is findable even while browsing another category.
 * A blank query falls back to browsing the selected category.
 */
object ProductQuery {

    /** Splits a raw query into lowercase tokens for AND matching. */
    fun tokens(query: String): List<String> =
        query.trim().lowercase().split(Regex("\\s+")).filter { it.isNotEmpty() }

    /** True if every token appears somewhere in the item's searchable text. */
    fun <T> matches(item: T, tokens: List<String>, searchableTextOf: (T) -> String): Boolean {
        if (tokens.isEmpty()) return true
        val hay = searchableTextOf(item).lowercase()
        return tokens.all { hay.contains(it) }
    }

    fun <T> apply(
        items: List<T>,
        categoryOf: (T) -> String?,
        searchableTextOf: (T) -> String,
        category: String,
        query: String,
        extraIncludes: Map<String, List<String>>,
    ): List<T> {
        val toks = tokens(query)
        val base = if (toks.isEmpty()) {
            CategoryLogic.filterByCategory(items, categoryOf, category, extraIncludes)
        } else {
            items
        }
        return base.filter { matches(it, toks, searchableTextOf) }
    }
}
