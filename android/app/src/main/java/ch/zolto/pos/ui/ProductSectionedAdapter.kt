package ch.zolto.pos.ui

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import coil.dispose
import coil.load
import com.google.android.material.card.MaterialCardView
import ch.zolto.pos.R
import ch.zolto.pos.data.models.ProductListItem

/**
 * RecyclerView adapter that renders category-grouped products with collapsible
 * section headers. Used when the user sorts by "Category".
 *
 * Headers show the category name, product count, and a chevron that rotates
 * to indicate expansion state. Tapping a header toggles its section.
 * Product items reuse the existing card and list layouts from the flat view.
 *
 * When used with a [GridLayoutManager], call [configureGridLayoutManager] so
 * that headers span the full width while product cards follow the grid.
 */
class ProductSectionedAdapter(
    private val onToggleSelect: (ch.zolto.pos.data.models.Product) -> Unit,
    private val onToggleCategory: (String) -> Unit,
) : ListAdapter<ProductListItem, RecyclerView.ViewHolder>(ItemDiff) {

    private var selectedIds: Set<Int> = emptySet()
    private var isListView: Boolean = false

    fun setSelectedIds(ids: Set<Int>) {
        selectedIds = ids
        notifyDataSetChanged()
    }

    fun setViewMode(isList: Boolean) {
        if (isListView == isList) return
        isListView = isList
        notifyDataSetChanged()
    }

    override fun getItemViewType(position: Int): Int = when (getItem(position)) {
        is ProductListItem.CategoryHeader -> TYPE_HEADER
        is ProductListItem.ProductItem -> TYPE_PRODUCT
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        return when (viewType) {
            TYPE_HEADER -> {
                val view = LayoutInflater.from(parent.context)
                    .inflate(R.layout.item_category_header, parent, false)
                HeaderViewHolder(view)
            }
            else -> {
                val layout = if (isListView) R.layout.item_product_list else R.layout.item_product_card
                val view = LayoutInflater.from(parent.context).inflate(layout, parent, false)
                ProductViewHolder(view)
            }
        }
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        when (val item = getItem(position)) {
            is ProductListItem.CategoryHeader -> (holder as HeaderViewHolder).bind(item)
            is ProductListItem.ProductItem -> (holder as ProductViewHolder).bind(item.product)
        }
    }

    inner class HeaderViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val layout: View = itemView.findViewById(R.id.layout_header)
        private val name: TextView = itemView.findViewById(R.id.txt_category_name)
        private val count: TextView = itemView.findViewById(R.id.txt_category_count)
        private val chevron: ImageView = itemView.findViewById(R.id.img_chevron)

        fun bind(header: ProductListItem.CategoryHeader) {
            name.text = header.category
            count.text = header.count.toString()
            chevron.rotation = if (header.isExpanded) 180f else 0f
            layout.setOnClickListener { onToggleCategory(header.category) }
        }
    }

    inner class ProductViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val card: MaterialCardView = itemView.findViewById(R.id.card_product)
        private val image: ImageView = itemView.findViewById(R.id.img_product)
        private val name: TextView = itemView.findViewById(R.id.txt_product_name)
        private val price: TextView = itemView.findViewById(R.id.txt_product_price)
        private val quantityBadge: TextView = itemView.findViewById(R.id.txt_quantity_badge)
        private val hiddenBadge: TextView? = itemView.findViewById(R.id.txt_hidden_badge)
        private val checkmark: ImageView = itemView.findViewById(R.id.img_checkmark)

        fun bind(product: ch.zolto.pos.data.models.Product) {
            val isSelected = product.id in selectedIds

            name.text = product.displayName
            price.text = "CHF ${product.priceChf}"

            if (product.imageUrl != null) {
                image.load(product.imageUrl) {
                    crossfade(true)
                    placeholder(R.drawable.ic_product_placeholder)
                }
            } else {
                image.dispose()
                image.setImageResource(R.drawable.ic_product_placeholder)
            }

            if (product.quantity > 1) {
                quantityBadge.visibility = View.VISIBLE
                quantityBadge.text = "${product.quantity} left"
            } else {
                quantityBadge.visibility = View.GONE
            }

            hiddenBadge?.visibility = if (!product.visible) View.VISIBLE else View.GONE
            checkmark.visibility = if (isSelected) View.VISIBLE else View.GONE

            card.isChecked = isSelected
            card.strokeWidth = if (isSelected) 6 else 0
            card.strokeColor = card.context.getColor(
                if (isSelected) R.color.selected_border else android.R.color.transparent
            )

            card.setOnClickListener { onToggleSelect(product) }
        }
    }

    companion object {
        private const val TYPE_HEADER = 0
        private const val TYPE_PRODUCT = 1

        /**
         * Creates a [GridLayoutManager] configured so that category headers span
         * the full row width while product items use the normal span count.
         */
        fun createGridLayoutManager(
            context: android.content.Context,
            spanCount: Int,
            adapter: ProductSectionedAdapter,
        ): GridLayoutManager {
            return GridLayoutManager(context, spanCount).apply {
                spanSizeLookup = object : GridLayoutManager.SpanSizeLookup() {
                    override fun getSpanSize(position: Int): Int {
                        return if (adapter.getItemViewType(position) == TYPE_HEADER) spanCount else 1
                    }
                }
            }
        }
    }

    object ItemDiff : DiffUtil.ItemCallback<ProductListItem>() {
        override fun areItemsTheSame(old: ProductListItem, new: ProductListItem): Boolean {
            return old.stableId == new.stableId
        }

        override fun areContentsTheSame(old: ProductListItem, new: ProductListItem): Boolean {
            return old == new
        }
    }
}
