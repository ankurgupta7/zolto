package ch.gwinn.pos.logic

import kotlin.test.*

class ProductQueryTest {

    // Test item carries a category and a searchable text blob.
    private data class Item(val id: Int, val category: String?, val text: String)

    private val extraIncludes = mapOf(
        "Necklaces" to listOf("Sets"),
        "Earrings" to listOf("Sets"),
    )

    private val catalog = listOf(
        Item(1, "Rings", "Gold Ring handmade emerald 250.00"),
        Item(2, "Necklaces", "Silver Necklace pearl 120.00"),
        Item(3, "Sets", "Bridal Set gold 800.00"),
        Item(4, "Earrings", "Silver Studs 45.00"),
    )

    private fun apply(category: String, query: String) = ProductQuery.apply(
        items = catalog,
        categoryOf = { it.category },
        searchableTextOf = { it.text },
        category = category,
        query = query,
        extraIncludes = extraIncludes,
    ).map { it.id }

    @Test
    fun `blank query browses the selected category`() {
        assertEquals(listOf(1), apply("Rings", ""))
    }

    @Test
    fun `blank query on a folding category includes Sets`() {
        assertEquals(listOf(2, 3), apply("Necklaces", "   "))
    }

    @Test
    fun `query searches across all categories ignoring the chip`() {
        // Browsing Rings, but searching "silver" still surfaces necklace + studs.
        assertEquals(listOf(2, 4), apply("Rings", "silver"))
    }

    @Test
    fun `query matches on price`() {
        assertEquals(listOf(3), apply("All", "800"))
    }

    @Test
    fun `query matches on description words`() {
        assertEquals(listOf(1), apply("All", "emerald"))
    }

    @Test
    fun `query is case-insensitive`() {
        assertEquals(listOf(1), apply("All", "GOLD RING"))
    }

    @Test
    fun `multiple tokens must all match (AND)`() {
        // "gold" matches items 1 and 3, but only 3 also contains "bridal".
        assertEquals(listOf(3), apply("All", "gold bridal"))
    }

    @Test
    fun `no match returns empty`() {
        assertTrue(apply("All", "platinum").isEmpty())
    }

    @Test
    fun `tokens splits and trims`() {
        assertEquals(listOf("gold", "ring"), ProductQuery.tokens("  Gold   Ring "))
        assertEquals(emptyList(), ProductQuery.tokens("   "))
    }
}
