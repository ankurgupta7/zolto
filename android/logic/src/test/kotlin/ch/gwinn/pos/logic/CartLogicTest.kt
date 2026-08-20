package ch.gwinn.pos.logic

import kotlin.test.*

class CartLogicTest {

    private fun product(id: Int, name: String = "Product $id", priceRappen: Int = 10000) =
        CartProduct(id = id, name = name, nameEn = null, priceRappen = priceRappen, quantity = 1)

    // ── CartProduct ───────────────────────────────────────────────────────────

    @Test
    fun `priceChf formats correctly`() {
        assertEquals("120.00", product(1, priceRappen = 12000).priceChf)
        assertEquals("9.90", product(1, priceRappen = 990).priceChf)
        assertEquals("0.50", product(1, priceRappen = 50).priceChf)
        assertEquals("1000.00", product(1, priceRappen = 100000).priceChf)
    }

    @Test
    fun `displayName prefers nameEn over name`() {
        val p = CartProduct(1, "Bague", "Ring", 10000, 1)
        assertEquals("Ring", p.displayName)
    }

    @Test
    fun `displayName falls back to name when nameEn is null`() {
        val p = CartProduct(1, "Bague", null, 10000, 1)
        assertEquals("Bague", p.displayName)
    }

    @Test
    fun `displayName falls back to name when nameEn is blank`() {
        val p = CartProduct(1, "Bague", "   ", 10000, 1)
        assertEquals("Bague", p.displayName)
    }

    // ── CartState ─────────────────────────────────────────────────────────────

    @Test
    fun `initial CartState is empty`() {
        val state = CartState()
        assertEquals(0, state.selectionCount)
        assertEquals(0, state.totalRappen)
        assertEquals("0.00", state.totalChf)
        assertTrue(state.selectedProducts.isEmpty())
    }

    @Test
    fun `toggleSelection adds product id`() {
        val state = CartState(products = listOf(product(1))).toggleSelection(1)
        assertTrue(1 in state.selectedIds)
    }

    @Test
    fun `toggleSelection removes already selected product id`() {
        val state = CartState(products = listOf(product(1)), selectedIds = setOf(1))
            .toggleSelection(1)
        assertFalse(1 in state.selectedIds)
    }

    @Test
    fun `toggleSelection supports multiple products`() {
        val state = CartState(products = listOf(product(1), product(2), product(3)))
            .toggleSelection(1)
            .toggleSelection(3)
        assertEquals(setOf(1, 3), state.selectedIds)
    }

    @Test
    fun `clearSelection empties selection`() {
        val state = CartState(products = listOf(product(1), product(2)), selectedIds = setOf(1, 2))
            .clearSelection()
        assertTrue(state.selectedIds.isEmpty())
    }

    @Test
    fun `totalRappen sums selected product prices`() {
        val products = listOf(product(1, priceRappen = 12000), product(2, priceRappen = 8500))
        val state = CartState(products = products, selectedIds = setOf(1, 2))
        assertEquals(20500, state.totalRappen)
        assertEquals("205.00", state.totalChf)
    }

    @Test
    fun `totalRappen counts only selected products`() {
        val products = listOf(
            product(1, priceRappen = 12000),
            product(2, priceRappen = 8500),
            product(3, priceRappen = 5000),
        )
        val state = CartState(products = products, selectedIds = setOf(1, 3))
        assertEquals(17000, state.totalRappen)
    }

    @Test
    fun `selectedProducts returns only selected items`() {
        val products = listOf(product(1), product(2), product(3))
        val state = CartState(products = products, selectedIds = setOf(1, 3))
        val selected = state.selectedProducts
        assertEquals(2, selected.size)
        assertTrue(selected.any { it.id == 1 })
        assertTrue(selected.any { it.id == 3 })
        assertFalse(selected.any { it.id == 2 })
    }

    // ── reconcileWithAvailable ────────────────────────────────────────────────

    @Test
    fun `reconcileWithAvailable updates product list`() {
        val initial = CartState(products = listOf(product(1), product(2)))
        val newProducts = listOf(product(1), product(3))
        val result = initial.reconcileWithAvailable(newProducts)
        assertEquals(2, result.products.size)
        assertTrue(result.products.any { it.id == 3 })
    }

    @Test
    fun `reconcileWithAvailable removes no-longer-available products from selection`() {
        val state = CartState(
            products = listOf(product(1), product(2)),
            selectedIds = setOf(1, 2),
        )
        val result = state.reconcileWithAvailable(listOf(product(1)))
        assertEquals(setOf(1), result.selectedIds)
    }

    @Test
    fun `reconcileWithAvailable keeps selection for still-available products`() {
        val state = CartState(
            products = listOf(product(1), product(2), product(3)),
            selectedIds = setOf(1, 3),
        )
        val result = state.reconcileWithAvailable(listOf(product(1), product(3)))
        assertEquals(setOf(1, 3), result.selectedIds)
    }

    @Test
    fun `reconcileWithAvailable clears all if none available`() {
        val state = CartState(
            products = listOf(product(1), product(2)),
            selectedIds = setOf(1, 2),
        )
        val result = state.reconcileWithAvailable(emptyList())
        assertTrue(result.selectedIds.isEmpty())
    }

    // ── PaymentStatus ─────────────────────────────────────────────────────────

    @Test
    fun `PaymentStatus initial state is Idle`() {
        val status: PaymentStatus = PaymentStatus.Idle
        assertTrue(status is PaymentStatus.Idle)
    }

    @Test
    fun `PaymentStatus IntentReady holds payment data`() {
        val status = PaymentStatus.IntentReady("pi_secret", posOrderId = 42, totalRappen = 15000)
        assertEquals("pi_secret", status.clientSecret)
        assertEquals(42, status.posOrderId)
        assertEquals(15000, status.totalRappen)
    }

    @Test
    fun `PaymentStatus Succeeded holds order data`() {
        val status = PaymentStatus.Succeeded(posOrderId = 10, totalRappen = 12000)
        assertEquals(10, status.posOrderId)
        assertEquals(12000, status.totalRappen)
    }

    @Test
    fun `PaymentStatus Failed holds error message`() {
        val status = PaymentStatus.Failed("Card declined")
        assertEquals("Card declined", status.message)
    }
}
