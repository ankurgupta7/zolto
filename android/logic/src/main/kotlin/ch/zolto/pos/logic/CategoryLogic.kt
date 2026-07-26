package ch.zolto.pos.logic

/**
 * Pure Kotlin category-filtering logic — no Android dependencies, no hard-coded
 * category names. The canonical category order and the "extra includes" map
 * (e.g. Sets fold into Necklaces/Earrings) both come from the website via
 * `GET /api/pos/categories`, so the POS app never re-types a category string.
 *
 * Mirrors the website shop: the filter bar shows "All" plus only the categories
 * that actually have products (empty categories are hidden), in canonical order.
 */
object CategoryLogic {

    /** Sentinel chip that shows every product; not a real product category. */
    const val ALL = "All"

    /**
     * The category chips to display: [ALL] first, then every canonical category
     * that at least one loaded product belongs to, in canonical order.
     *
     * @param canonicalOrder ordered category list from the server.
     * @param present the set of categories present on the loaded products.
     */
    fun visibleCategories(
        canonicalOrder: List<String>,
        present: Set<String>,
    ): List<String> {
        val nonEmpty = canonicalOrder.filter { it in present }
        // Fall back to the present categories (in first-seen order) if the server
        // list is unavailable, so the bar still hides empty categories offline.
        val ordered = if (canonicalOrder.isEmpty()) present.toList() else nonEmpty
        return listOf(ALL) + ordered
    }

    /**
     * Items belonging to [category], folding in any [extraIncludes] targets
     * (e.g. selecting Necklaces also shows Sets). [ALL] returns everything.
     * Generic over the item type via [categoryOf] so it works with any product
     * model without the logic module depending on it.
     */
    fun <T> filterByCategory(
        items: List<T>,
        categoryOf: (T) -> String?,
        category: String,
        extraIncludes: Map<String, List<String>>,
    ): List<T> {
        if (category == ALL) return items
        val folded = extraIncludes[category].orEmpty()
        return items.filter { item ->
            val c = categoryOf(item)
            c == category || (c != null && c in folded)
        }
    }
}
