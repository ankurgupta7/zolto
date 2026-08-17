package ch.zolto.pos.data.models

import com.google.gson.annotations.SerializedName

// Bargained final price per product, in Rappen, keyed by product id (as a
// string — JSON object keys are always strings). Only products the cashier
// actually overrode from list price appear here.
typealias PriceOverrides = Map<String, Int>

// An item sold outside the catalogue entirely — no product row backs it.
data class CustomLineItemRequest(
    @SerializedName("name") val name: String,
    @SerializedName("priceRappen") val priceRappen: Int,
)

data class PaymentIntentRequest(
    @SerializedName("productIds") val productIds: List<Int>,
    // Acknowledges the sale may include a product hidden from the default
    // storefront view (see PosSession.showHiddenItems) so the backend allows
    // it through instead of rejecting a legitimate, intentional sale.
    @SerializedName("allowHidden") val allowHidden: Boolean = false,
    // Bargained final price per product, in Rappen, keyed by product id (as a
    // string — JSON object keys are always strings). Only products the cashier
    // actually overrode from list price appear here.
    @SerializedName("priceOverrides") val priceOverrides: Map<String, Int> = emptyMap(),
    // Items sold outside the catalogue (no product row backs them).
    @SerializedName("customItems") val customItems: List<CustomLineItemRequest> = emptyList(),
    // Customer details for invoice / receipt records.
    @SerializedName("customerName") val customerName: String? = null,
    @SerializedName("customerEmail") val customerEmail: String? = null,
    @SerializedName("customerPhone") val customerPhone: String? = null,
)

data class PaymentIntentResponse(
    @SerializedName("clientSecret") val clientSecret: String,
    @SerializedName("posOrderId") val posOrderId: Int,
    @SerializedName("totalRappen") val totalRappen: Int,
)

data class SaleRequest(
    @SerializedName("paymentIntentId") val paymentIntentId: String,
)

data class SaleResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("posOrderId") val posOrderId: Int,
    @SerializedName("alreadyFulfilled") val alreadyFulfilled: Boolean?,
)

// Attested sales: no Stripe PaymentIntent is ever created. Either the cashier
// took the money in hand (`cash`) or the customer scanned the merchant's own
// TWINT QR sticker and the merchant watched it arrive in their TWINT app
// (`twint_qr`) — TWINT gives us no API to verify that, so the merchant's word
// is the record. Bookkeeping is otherwise identical to the card flow.
// (Card uses Tap to Pay; Stripe-brokered TWINT uses a real PaymentIntent —
// see TwintIntentResponse — and is a DIFFERENT payment method from twint_qr.)
data class ManualSaleRequest(
    @SerializedName("productIds") val productIds: List<Int>,
    @SerializedName("paymentMethod") val paymentMethod: String = "cash",
    // Same acknowledgement the card and TWINT paths send: the sale may include
    // a piece hidden from the storefront (see PosSession.showHiddenItems).
    // Without it the backend's availability check refuses a hidden piece with
    // 409 "One or more items are no longer available".
    @SerializedName("allowHidden") val allowHidden: Boolean = false,
    @SerializedName("priceOverrides") val priceOverrides: Map<String, Int> = emptyMap(),
    @SerializedName("customItems") val customItems: List<CustomLineItemRequest> = emptyList(),
    // Customer details for invoice / receipt records.
    @SerializedName("customerName") val customerName: String? = null,
    @SerializedName("customerEmail") val customerEmail: String? = null,
    @SerializedName("customerPhone") val customerPhone: String? = null,
)

data class ManualSaleResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("posOrderId") val posOrderId: Int,
    @SerializedName("totalRappen") val totalRappen: Int,
)

// TWINT goes through Stripe: the backend creates + confirms a `twint`
// PaymentIntent and hands back the Stripe redirect URL, which the app renders
// as a QR code for the customer to scan with their TWINT app. The app then
// polls /pos/sale (confirmSale) until the PaymentIntent succeeds.
data class TwintIntentRequest(
    @SerializedName("productIds") val productIds: List<Int>,
    // Acknowledges the sale may include a product hidden from the default
    // storefront view (see PosSession.showHiddenItems) so the backend allows
    // it through instead of rejecting a legitimate, intentional sale.
    @SerializedName("allowHidden") val allowHidden: Boolean = false,
    @SerializedName("priceOverrides") val priceOverrides: Map<String, Int> = emptyMap(),
    @SerializedName("customItems") val customItems: List<CustomLineItemRequest> = emptyList(),
    // TWINT requires a phone number per Stripe's terms. Email triggers a
    // Stripe receipt.
    @SerializedName("customerName") val customerName: String? = null,
    @SerializedName("customerEmail") val customerEmail: String? = null,
    @SerializedName("customerPhone") val customerPhone: String? = null,
)

data class TwintIntentResponse(
    @SerializedName("redirectUrl") val redirectUrl: String,
    @SerializedName("paymentIntentId") val paymentIntentId: String,
    @SerializedName("posOrderId") val posOrderId: Int,
    @SerializedName("totalRappen") val totalRappen: Int,
)

data class ConnectionTokenResponse(
    @SerializedName("secret") val secret: String,
)

data class HealthResponse(
    @SerializedName("ok") val ok: Boolean,
)

data class PosConfigResponse(
    @SerializedName("locationId") val locationId: String,
    // Present on zolto; ignored by older backends.
    @SerializedName("tenantSlug") val tenantSlug: String? = null,
    // The merchant's own TWINT QR sticker, uploaded in the admin. Null means
    // they haven't got one, and the TWINT (QR) option must stay hidden — we
    // must never offer a rail we can't actually put on screen.
    @SerializedName("twintQrUrl") val twintQrUrl: String? = null,
)

// First-time Terminal provisioning (zolto POST /api/pos/terminal/location).
data class LocationProvisionRequest(
    @SerializedName("displayName") val displayName: String,
    @SerializedName("address") val address: Address,
) {
    data class Address(
        @SerializedName("line1") val line1: String,
        @SerializedName("city") val city: String,
        @SerializedName("postal_code") val postalCode: String,
        @SerializedName("country") val country: String,
    )
}

data class LocationProvisionResponse(
    @SerializedName("locationId") val locationId: String,
)

// Null for a custom line item sold outside the catalogue.
data class SaleItem(
    @SerializedName("productId") val productId: Int?,
    // Resolved server-side: the product's name for catalogue items, or the
    // cashier-entered name for custom items.
    @SerializedName("productName") val productName: String,
    @SerializedName("priceRappen") val priceRappen: Int,
) {
    val displayName: String get() = productName
}

data class SaleSummary(
    @SerializedName("id") val id: Int,
    @SerializedName("status") val status: String,
    @SerializedName("totalRappen") val totalRappen: Int,
    @SerializedName("totalChf") val totalChf: String,
    // Nullable/defaulted so sales cached locally before this field existed
    // (see SaleEntity.toSummary) still deserialize fine.
    @SerializedName("paymentMethod") val paymentMethod: String? = "card",
    @SerializedName("createdAt") val createdAt: String,
    @SerializedName("items") val items: List<SaleItem>,
)

// Receipt email / S3 save requests

data class SendReceiptRequest(
    @SerializedName("posOrderId") val posOrderId: Int,
    @SerializedName("customerName") val customerName: String? = null,
    @SerializedName("customerEmail") val customerEmail: String,
    @SerializedName("customerPhone") val customerPhone: String? = null,
)

data class SendReceiptResponse(
    @SerializedName("success") val success: Boolean,
)

data class SaveReceiptRequest(
    @SerializedName("posOrderId") val posOrderId: Int,
    @SerializedName("customerName") val customerName: String? = null,
    @SerializedName("customerEmail") val customerEmail: String? = null,
    @SerializedName("customerPhone") val customerPhone: String? = null,
)

data class SaveReceiptResponse(
    @SerializedName("receiptUrl") val receiptUrl: String,
    @SerializedName("alreadySaved") val alreadySaved: Boolean? = null,
)
