package ch.gwinn.pos.logic

import kotlin.test.*

class MoneyTest {

    // Money.parseChfToRappen is what stands between a cashier's typed
    // bargained price / custom item price and what actually gets charged, so
    // its parsing rules are worth pinning down precisely.

    @Test
    fun `parses whole number`() {
        assertEquals(3500, Money.parseChfToRappen("35"))
    }

    @Test
    fun `parses decimal with dot`() {
        assertEquals(3550, Money.parseChfToRappen("35.50"))
    }

    @Test
    fun `parses decimal with comma`() {
        assertEquals(3550, Money.parseChfToRappen("35,50"))
    }

    @Test
    fun `rounds to nearest rappen`() {
        assertEquals(1001, Money.parseChfToRappen("10.006"))
        assertEquals(1000, Money.parseChfToRappen("10.001"))
    }

    @Test
    fun `trims whitespace`() {
        assertEquals(2000, Money.parseChfToRappen("  20.00  "))
    }

    @Test
    fun `allows zero`() {
        assertEquals(0, Money.parseChfToRappen("0"))
    }

    @Test
    fun `rejects negative amounts`() {
        assertNull(Money.parseChfToRappen("-5"))
    }

    @Test
    fun `rejects non-numeric input`() {
        assertNull(Money.parseChfToRappen("abc"))
    }

    @Test
    fun `rejects blank input`() {
        assertNull(Money.parseChfToRappen(""))
        assertNull(Money.parseChfToRappen("   "))
    }

    @Test
    fun `chfString formats rappen as two decimals`() {
        assertEquals("35.50", Money.chfString(3550))
        assertEquals("0.00", Money.chfString(0))
    }

    @Test
    fun `chfDisplay prefixes the currency for customer-facing amounts`() {
        // Shown next to the TWINT QR sticker for the customer to type in.
        assertEquals("CHF 47.00", Money.chfDisplay(4700))
        assertEquals("CHF 0.05", Money.chfDisplay(5))
        assertEquals("CHF 1234.50", Money.chfDisplay(123450))
    }
}
