package ch.gwinn.pos.logic

/**
 * Pure Kotlin business logic for the cart — no Android dependencies.
 * The Android ViewModel delegates to these functions.
 */

data class CartProduct(
    val id: Int,
    val name: String,
    val nameEn: String?,
    val priceRappen: Int,
    val quantity: Int,
) {
    val priceChf: String get() = "%.2f".format(priceRappen / 100.0)
    val displayName: String get() = nameEn?.takeIf { it.isNotBlank() } ?: name
}

data class CartState(
    val products: List<CartProduct> = emptyList(),
    val selectedIds: Set<Int> = emptySet(),
) {
    val selectedProducts: List<CartProduct> get() = products.filter { it.id in selectedIds }
    val totalRappen: Int get() = selectedProducts.sumOf { it.priceRappen }
    val totalChf: String get() = "%.2f".format(totalRappen / 100.0)
    val selectionCount: Int get() = selectedIds.size
}

fun CartState.toggleSelection(productId: Int): CartState =
    copy(selectedIds = if (productId in selectedIds) selectedIds - productId else selectedIds + productId)

fun CartState.clearSelection(): CartState = copy(selectedIds = emptySet())

/** Removes sold/unavailable products from selection after a product refresh. */
fun CartState.reconcileWithAvailable(available: List<CartProduct>): CartState {
    val availableIds = available.map { it.id }.toSet()
    return copy(products = available, selectedIds = selectedIds intersect availableIds)
}

/** Payment state machine — pure Kotlin, no Android dependencies. */
sealed class PaymentStatus {
    object Idle : PaymentStatus()
    object CreatingIntent : PaymentStatus()
    data class IntentReady(val clientSecret: String, val posOrderId: Int, val totalRappen: Int) : PaymentStatus()
    object CollectingPayment : PaymentStatus()
    object ProcessingPayment : PaymentStatus()
    data class Succeeded(val posOrderId: Int, val totalRappen: Int) : PaymentStatus()
    data class Failed(val message: String) : PaymentStatus()
    object Cancelled : PaymentStatus()
}
