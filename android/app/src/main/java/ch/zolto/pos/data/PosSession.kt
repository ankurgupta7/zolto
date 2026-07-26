package ch.zolto.pos.data

import ch.zolto.pos.data.models.CustomLineItem
import ch.zolto.pos.data.models.Product

/**
 * In-memory only — deliberately NOT persisted to disk, so it resets on every
 * app/process restart. A cashier must consciously re-enable [showHiddenItems]
 * each session before hidden (e.g. off-storefront) products can be browsed
 * and sold, rather than it silently staying on indefinitely.
 *
 * [priceOverrides] and [customItems] are the current cart's bargained prices
 * and non-inventory items. They live here (rather than on ProductViewModel)
 * because MainActivity and SaleReviewActivity each hold their own
 * Activity-scoped ProductViewModel instance, so this is the one place both
 * screens — and PaymentViewModel, when it builds the charge request — agree
 * on what the cashier has done to this sale.
 */
object PosSession {
    @Volatile
    var showHiddenItems: Boolean = false

    // Bargained final price per product, in Rappen, keyed by product id. Only
    // products the cashier has actually overridden from list price appear
    // here — everything else charges at its normal priceRappen.
    val priceOverrides: MutableMap<Int, Int> = mutableMapOf()

    // Items being sold outside the catalogue entirely (no product row).
    val customItems: MutableList<CustomLineItem> = mutableListOf()

    /** The price actually charged for a product: its bargained override if set, otherwise list price. */
    fun chargedPriceRappen(product: Product): Int = priceOverrides[product.id] ?: product.priceRappen

    /** Sets (or, when `null`, clears) the bargained override for a product. */
    fun setPriceOverride(productId: Int, priceRappen: Int?) {
        if (priceRappen != null) priceOverrides[productId] = priceRappen else priceOverrides.remove(productId)
    }

    fun totalRappenFor(products: List<Product>): Int =
        products.sumOf { chargedPriceRappen(it) } + customItems.sumOf { it.priceRappen }

    /** Clears everything about the current sale — call once it's fully paid or abandoned. */
    fun clearCart() {
        priceOverrides.clear()
        customItems.clear()
    }
}
