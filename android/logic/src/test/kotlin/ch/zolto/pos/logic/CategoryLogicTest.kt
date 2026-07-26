package ch.zolto.pos.logic

import kotlin.test.*

class CategoryLogicTest {

    private val canonical = listOf(
        "Necklaces", "Earrings", "Sets", "Rings", "Bracelets",
        "Bangles", "Anklets", "Brooches", "Hair Accessories", "Other",
    )
    private val extraIncludes = mapOf(
        "Necklaces" to listOf("Sets"),
        "Earrings" to listOf("Sets"),
    )

    private fun product(id: Int, category: String?) =
        CartProduct(id = id, name = "P$id", nameEn = null, priceRappen = 1000, quantity = 1) to category

    // ── visibleCategories ─────────────────────────────────────────────────────

    @Test
    fun `visibleCategories always starts with All`() {
        val result = CategoryLogic.visibleCategories(canonical, setOf("Rings"))
        assertEquals("All", result.first())
    }

    @Test
    fun `visibleCategories hides categories with no products`() {
        val present = setOf("Necklaces", "Rings")
        val result = CategoryLogic.visibleCategories(canonical, present)
        assertEquals(listOf("All", "Necklaces", "Rings"), result)
    }

    @Test
    fun `visibleCategories preserves canonical order regardless of present order`() {
        // Present set iteration order must not leak — Rings must follow Necklaces.
        val present = setOf("Rings", "Necklaces", "Other")
        val result = CategoryLogic.visibleCategories(canonical, present)
        assertEquals(listOf("All", "Necklaces", "Rings", "Other"), result)
    }

    @Test
    fun `visibleCategories with no products is just All`() {
        assertEquals(listOf("All"), CategoryLogic.visibleCategories(canonical, emptySet()))
    }

    @Test
    fun `visibleCategories falls back to present set when canonical order is empty`() {
        // Offline / categories endpoint unavailable: still hide empty categories.
        val result = CategoryLogic.visibleCategories(emptyList(), setOf("Rings"))
        assertEquals(listOf("All", "Rings"), result)
    }

    @Test
    fun `visibleCategories ignores present categories not in canonical list`() {
        val result = CategoryLogic.visibleCategories(canonical, setOf("Rings", "Ghost"))
        assertEquals(listOf("All", "Rings"), result)
    }

    // ── filterByCategory ──────────────────────────────────────────────────────

    private val catalog = listOf(
        product(1, "Necklaces"),
        product(2, "Earrings"),
        product(3, "Sets"),
        product(4, "Rings"),
        product(5, null),
    )

    private fun filter(category: String) = CategoryLogic.filterByCategory(
        items = catalog,
        categoryOf = { it.second },
        category = category,
        extraIncludes = extraIncludes,
    ).map { it.first.id }

    @Test
    fun `filter All returns everything`() {
        assertEquals(listOf(1, 2, 3, 4, 5), filter("All"))
    }

    @Test
    fun `filter Rings returns only rings`() {
        assertEquals(listOf(4), filter("Rings"))
    }

    @Test
    fun `filter Necklaces folds in Sets`() {
        assertEquals(listOf(1, 3), filter("Necklaces"))
    }

    @Test
    fun `filter Earrings folds in Sets`() {
        assertEquals(listOf(2, 3), filter("Earrings"))
    }

    @Test
    fun `filter Sets does not fold in Necklaces or Earrings`() {
        assertEquals(listOf(3), filter("Sets"))
    }

    @Test
    fun `filter never matches null categories`() {
        // Product 5 has a null category and must not appear under any filter.
        assertFalse(filter("Necklaces").contains(5))
        assertFalse(filter("Rings").contains(5))
    }

    @Test
    fun `filter with empty extraIncludes does no folding`() {
        val ids = CategoryLogic.filterByCategory(
            items = catalog,
            categoryOf = { it.second },
            category = "Necklaces",
            extraIncludes = emptyMap(),
        ).map { it.first.id }
        assertEquals(listOf(1), ids)
    }
}
