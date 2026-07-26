package ch.zolto.pos

import com.google.gson.Gson
import ch.zolto.pos.data.models.ConnectionTokenResponse
import ch.zolto.pos.data.models.CustomLineItemRequest
import ch.zolto.pos.data.models.ManualSaleRequest
import ch.zolto.pos.data.models.ManualSaleResponse
import ch.zolto.pos.data.models.PaymentIntentRequest
import ch.zolto.pos.data.models.PaymentIntentResponse
import ch.zolto.pos.data.models.LocationProvisionRequest
import ch.zolto.pos.data.models.LocationProvisionResponse
import ch.zolto.pos.data.models.PosConfigResponse
import ch.zolto.pos.data.models.SaleRequest
import ch.zolto.pos.data.models.SaleResponse
import ch.zolto.pos.data.models.TwintIntentRequest
import ch.zolto.pos.data.models.TwintIntentResponse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Tests for the Stripe-related API models — verifies that the JSON wire format
 * matches what `Zolto-ch/server/pos.ts` expects and produces.
 *
 * These are pure serialization tests (no network, no Stripe SDK) that guard
 * against the iOS/Android apps and backend silently drifting out of sync.
 */
class StripeModelsTest {

    private val gson = Gson()

    // ─── PaymentIntentRequest (card / Tap to Pay) ────────────────────────────

    @Test
    fun `paymentIntentRequest encodes minimal payload`() {
        val request = PaymentIntentRequest(productIds = listOf(1, 2))
        val json = gson.toJson(request)

        assertTrue(json.contains(""""productIds":[1,2]"""))
        assertTrue(json.contains(""""allowHidden":false"""))
    }

    @Test
    fun `paymentIntentRequest encodes priceOverrides as string keys`() {
        val request = PaymentIntentRequest(
            productIds = listOf(1),
            priceOverrides = mapOf("1" to 3500)
        )
        val json = gson.toJson(request)

        // JSON object keys are always strings — the backend expects this format
        assertTrue(json.contains(""""priceOverrides":{"1":3500}"""))
    }

    @Test
    fun `paymentIntentRequest encodes custom items`() {
        val request = PaymentIntentRequest(
            productIds = emptyList(),
            customItems = listOf(CustomLineItemRequest(name = "Custom repair", priceRappen = 1500))
        )
        val json = gson.toJson(request)

        assertTrue(json.contains(""""customItems":[{"name":"Custom repair","priceRappen":1500}]"""))
    }

    @Test
    fun `paymentIntentRequest encodes allowHidden flag`() {
        val request = PaymentIntentRequest(
            productIds = listOf(1),
            allowHidden = true
        )
        val json = gson.toJson(request)

        assertTrue(json.contains(""""allowHidden":true"""))
    }

    @Test
    fun `paymentIntentRequest round-trips through gson`() {
        val original = PaymentIntentRequest(
            productIds = listOf(1, 3),
            allowHidden = true,
            priceOverrides = mapOf("1" to 3500, "3" to 2200),
            customItems = listOf(CustomLineItemRequest(name = "Gift wrap", priceRappen = 500))
        )
        val json = gson.toJson(original)
        val decoded = gson.fromJson(json, PaymentIntentRequest::class.java)

        assertEquals(original.productIds, decoded.productIds)
        assertEquals(original.allowHidden, decoded.allowHidden)
        assertEquals(original.priceOverrides, decoded.priceOverrides)
        assertEquals(original.customItems.size, decoded.customItems.size)
        assertEquals(original.customItems.first().name, decoded.customItems.first().name)
    }

    // ─── PaymentIntentResponse ────────────────────────────────────────────────

    @Test
    fun `decodes paymentIntentResponse from backend json`() {
        val json = """{"clientSecret":"pi_test_secret","posOrderId":42,"totalRappen":15000}"""
        val response = gson.fromJson(json, PaymentIntentResponse::class.java)

        assertEquals("pi_test_secret", response.clientSecret)
        assertEquals(42, response.posOrderId)
        assertEquals(15000, response.totalRappen)
    }

    // ─── TwintIntentRequest ──────────────────────────────────────────────────

    @Test
    fun `TwintIntentRequest encodes minimal payload`() {
        val request = TwintIntentRequest(productIds = listOf(1))
        val json = gson.toJson(request)

        assertTrue(json.contains(""""productIds":[1]"""))
    }

    @Test
    fun `TwintIntentRequest encodes allowHidden flag`() {
        val request = TwintIntentRequest(
            productIds = listOf(1),
            allowHidden = true
        )
        val json = gson.toJson(request)

        assertTrue(json.contains(""""allowHidden":true"""))
    }

    @Test
    fun `TwintIntentRequest encodes priceOverrides`() {
        val request = TwintIntentRequest(
            productIds = listOf(1),
            priceOverrides = mapOf("1" to 4000)
        )
        val json = gson.toJson(request)

        assertTrue(json.contains(""""priceOverrides":{"1":4000}"""))
    }

    @Test
    fun `TwintIntentRequest encodes custom items`() {
        val request = TwintIntentRequest(
            productIds = listOf(2),
            customItems = listOf(CustomLineItemRequest(name = "Engraving", priceRappen = 800))
        )
        val json = gson.toJson(request)

        assertTrue(json.contains(""""customItems":[{"name":"Engraving","priceRappen":800}]"""))
    }

    @Test
    fun `TwintIntentRequest round-trips through gson`() {
        val original = TwintIntentRequest(
            productIds = listOf(1),
            allowHidden = true,
            priceOverrides = mapOf("1" to 3000),
            customItems = listOf(CustomLineItemRequest(name = "Box", priceRappen = 200))
        )
        val json = gson.toJson(original)
        val decoded = gson.fromJson(json, TwintIntentRequest::class.java)

        assertEquals(original.productIds, decoded.productIds)
        assertEquals(original.allowHidden, decoded.allowHidden)
        assertEquals(original.priceOverrides, decoded.priceOverrides)
        assertEquals(original.customItems.size, decoded.customItems.size)
    }

    /**
     * Contract snapshot: the exact JSON the Android app sends to
     * POST /api/pos/twint-intent. If this ever drifts from what
     * Zolto-ch/server/pos.ts expects, the build breaks.
     */
    @Test
    fun `TwintIntentRequest matches backend contract snapshot`() {
        val request = TwintIntentRequest(
            productIds = listOf(1, 2),
            allowHidden = true,
            priceOverrides = mapOf("1" to 3500, "2" to 2200),
            customItems = listOf(CustomLineItemRequest(name = "Gift wrap", priceRappen = 500)),
            customerName = "Jane Buyer",
            customerEmail = "jane@example.com",
            customerPhone = "+41791234567"
        )

        val json = gson.toJson(request)

        assertEquals(
            """{"productIds":[1,2],"allowHidden":true,"priceOverrides":{"1":3500,"2":2200},"customItems":[{"name":"Gift wrap","priceRappen":500}],"customerName":"Jane Buyer","customerEmail":"jane@example.com","customerPhone":"+41791234567"}""",
            json
        )
    }

    // ─── TwintIntentResponse ─────────────────────────────────────────────────

    @Test
    fun `decodes TwintIntentResponse from backend json`() {
        val json = """{"redirectUrl":"https://hooks.stripe.com/twint/pi_1","paymentIntentId":"pi_1","posOrderId":7,"totalRappen":9000}"""
        val response = gson.fromJson(json, TwintIntentResponse::class.java)

        assertEquals("https://hooks.stripe.com/twint/pi_1", response.redirectUrl)
        assertEquals("pi_1", response.paymentIntentId)
        assertEquals(7, response.posOrderId)
        assertEquals(9000, response.totalRappen)
    }

    // ─── SaleRequest / SaleResponse ──────────────────────────────────────────

    @Test
    fun `saleRequest encodes to json`() {
        val request = SaleRequest(paymentIntentId = "pi_test_123")
        val json = gson.toJson(request)

        assertTrue(json.contains(""""paymentIntentId":"pi_test_123"""))
    }

    @Test
    fun `decodes saleResponse success`() {
        val json = """{"success":true,"posOrderId":42,"alreadyFulfilled":false}"""
        val response = gson.fromJson(json, SaleResponse::class.java)

        assertTrue(response.success)
        assertEquals(42, response.posOrderId)
        assertEquals(false, response.alreadyFulfilled)
    }

    @Test
    fun `decodes saleResponse already fulfilled`() {
        val json = """{"success":true,"posOrderId":7,"alreadyFulfilled":true}"""
        val response = gson.fromJson(json, SaleResponse::class.java)

        assertTrue(response.success)
        assertEquals(true, response.alreadyFulfilled)
    }

    // ─── ManualSaleRequest / ManualSaleResponse ──────────────────────────────

    @Test
    fun `manualSaleRequest encodes minimal payload`() {
        val request = ManualSaleRequest(productIds = listOf(1, 2), paymentMethod = "cash")
        val json = gson.toJson(request)

        assertTrue(json.contains(""""productIds":[1,2]"""))
        assertTrue(json.contains(""""paymentMethod":"cash""""))
    }

    @Test
    fun `manualSaleRequest encodes priceOverrides and customItems`() {
        val request = ManualSaleRequest(
            productIds = listOf(1),
            paymentMethod = "cash",
            priceOverrides = mapOf("1" to 3500),
            customItems = listOf(CustomLineItemRequest(name = "Repair", priceRappen = 1000))
        )
        val json = gson.toJson(request)

        assertTrue(json.contains(""""priceOverrides":{"1":3500}"""))
        assertTrue(json.contains(""""customItems":[{"name":"Repair","priceRappen":1000}]"""))
    }

    @Test
    fun `decodes manualSaleResponse`() {
        val json = """{"success":true,"posOrderId":55,"totalRappen":9000}"""
        val response = gson.fromJson(json, ManualSaleResponse::class.java)

        assertTrue(response.success)
        assertEquals(55, response.posOrderId)
        assertEquals(9000, response.totalRappen)
    }

    // ─── ConnectionTokenResponse ─────────────────────────────────────────────

    @Test
    fun `decodes connectionTokenResponse`() {
        val json = """{"secret":"pst_test_secret"}"""
        val response = gson.fromJson(json, ConnectionTokenResponse::class.java)

        assertEquals("pst_test_secret", response.secret)
    }

    // ─── PosConfigResponse ───────────────────────────────────────────────────

    @Test
    fun `decodes posConfigResponse with location id`() {
        val json = """{"locationId":"tml_test_123"}"""
        val response = gson.fromJson(json, PosConfigResponse::class.java)

        assertEquals("tml_test_123", response.locationId)
    }

    @Test
    fun `decodes posConfigResponse with empty location id`() {
        val json = """{"locationId":""}"""
        val response = gson.fromJson(json, PosConfigResponse::class.java)

        assertEquals("", response.locationId)
    }

    // ─── Regression: priceOverrides keys must be strings ─────────────────────

    /**
     * Guards against a backend contract break: the server expects
     * priceOverrides keys as strings (JSON object keys are always strings).
     * If the Android serializer ever changes to output numeric keys, this
     * test will catch it.
     */
    @Test
    fun `priceOverrides keys are always strings in json`() {
        val request = PaymentIntentRequest(
            productIds = listOf(999),
            priceOverrides = mapOf("999" to 5000)
        )
        val json = gson.toJson(request)

        // The encoded JSON must contain "999" as a string key
        assertTrue(
            "priceOverrides key must be a JSON string",
            json.contains(""""999":5000""")
        )
    }

    // ─── Customer fields on requests ─────────────────────────────────────────

    @Test
    fun `paymentIntentRequest encodes customer details when provided`() {
        val request = PaymentIntentRequest(
            productIds = listOf(1),
            customerName = "Jane Buyer",
            customerEmail = "jane@example.com",
            customerPhone = "+41791234567"
        )
        val json = gson.toJson(request)

        assertTrue(json.contains(""""customerName":"Jane Buyer"""))
        assertTrue(json.contains(""""customerEmail":"jane@example.com"""))
        assertTrue(json.contains(""""customerPhone":"+41791234567"""))
    }

    @Test
    fun `TwintIntentRequest encodes customer details when provided`() {
        val request = TwintIntentRequest(
            productIds = listOf(1),
            customerName = "Jane Buyer",
            customerEmail = "jane@example.com",
            customerPhone = "+41791234567"
        )
        val json = gson.toJson(request)

        assertTrue(json.contains(""""customerName":"Jane Buyer"""))
        assertTrue(json.contains(""""customerEmail":"jane@example.com"""))
        assertTrue(json.contains(""""customerPhone":"+41791234567"""))
    }

    // ── Terminal provisioning (zolto POST /api/pos/terminal/location) ────────

    @Test
    fun locationProvisionRequestSerializesForZoltoBackend() {
        val json = gson.toJson(
            LocationProvisionRequest(
                displayName = "Zolto POS",
                address = LocationProvisionRequest.Address(
                    line1 = "Bahnhofstrasse 1",
                    city = "Zürich",
                    postalCode = "8001",
                    country = "CH",
                ),
            ),
        )
        // The backend (server/pos.ts) reads address.postal_code snake_case.
        assertTrue(json.contains("\"displayName\":\"Zolto POS\""))
        assertTrue(json.contains("\"postal_code\":\"8001\""))
        assertTrue(json.contains("\"country\":\"CH\""))
    }

    @Test
    fun locationProvisionResponseParses() {
        val res = gson.fromJson(
            "{\"locationId\":\"tml_abc123\"}",
            LocationProvisionResponse::class.java,
        )
        assertEquals("tml_abc123", res.locationId)
    }

    @Test
    fun posConfigToleratesMissingTenantSlug() {
        // Older backends return only locationId; tenantSlug must stay optional.
        val res = gson.fromJson(
            "{\"locationId\":\"tml_x\"}",
            PosConfigResponse::class.java,
        )
        assertEquals("tml_x", res.locationId)
        assertNull(res.tenantSlug)
    }
}
