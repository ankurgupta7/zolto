package ch.gwinn.pos

import ch.gwinn.pos.data.models.Product
import org.junit.Assert.*
import org.junit.Test

class ProductModelTest {

    private fun makeProduct(
        id: Int = 1,
        name: String = "Bague",
        nameEn: String? = null,
        priceRappen: Int = 12000,
        quantity: Int = 1,
        visible: Boolean = true,
    ) = Product(
        id = id, name = name, nameEn = nameEn, price = null,
        priceRappen = priceRappen, category = null, imageUrl = null, imageKey = null,
        quantity = quantity, visible = visible,
    )

    @Test
    fun `visible defaults to true so old call sites without the field stay correct`() {
        val product = Product(
            id = 1, name = "Bague", nameEn = null, price = null,
            priceRappen = 12000, category = null, imageUrl = null, imageKey = null,
            quantity = 1,
        )
        assertTrue(product.visible)
    }

    @Test
    fun `visible can be explicitly false for hidden products`() {
        assertFalse(makeProduct(visible = false).visible)
    }

    @Test
    fun `priceChf formats correctly`() {
        assertEquals("120.00", makeProduct(priceRappen = 12000).priceChf)
        assertEquals("9.90", makeProduct(priceRappen = 990).priceChf)
        assertEquals("1000.00", makeProduct(priceRappen = 100000).priceChf)
    }

    @Test
    fun `displayName uses nameEn when available`() {
        val product = makeProduct(name = "Bague", nameEn = "Ring")
        assertEquals("Ring", product.displayName)
    }

    @Test
    fun `displayName falls back to name when nameEn is null`() {
        val product = makeProduct(name = "Bague", nameEn = null)
        assertEquals("Bague", product.displayName)
    }

    @Test
    fun `displayName falls back to name when nameEn is blank`() {
        val product = makeProduct(name = "Bague", nameEn = "  ")
        assertEquals("Bague", product.displayName)
    }
}
