package ch.zolto.pos.data.models

/**
 * RecyclerView items used when the product list is grouped by category.
 *
 * A flat list of these is emitted by [ProductViewModel] when the user sorts
 * by category. Headers are full-width rows that can be tapped to expand or
 * collapse their section; product items render with the same card/list layout
 * used in the non-grouped view.
 */
sealed class ProductListItem {
    abstract val stableId: Long

    data class CategoryHeader(
        val category: String,
        val count: Int,
        val isExpanded: Boolean,
    ) : ProductListItem() {
        override val stableId: Long = ("hdr_" + category).hashCode().toLong()
    }

    data class ProductItem(
        val product: Product,
    ) : ProductListItem() {
        override val stableId: Long = product.id.toLong()
    }
}
