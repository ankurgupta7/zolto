package ch.gwinn.pos.ui

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import coil.dispose
import coil.load
import com.google.android.material.card.MaterialCardView
import ch.gwinn.pos.R
import ch.gwinn.pos.data.models.Product

class ProductGridAdapter(
    private val onToggleSelect: (Product) -> Unit,
) : ListAdapter<Product, ProductGridAdapter.ViewHolder>(ProductDiff) {

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

    inner class ViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        val card: MaterialCardView = itemView.findViewById(R.id.card_product)
        val image: ImageView = itemView.findViewById(R.id.img_product)
        val name: TextView = itemView.findViewById(R.id.txt_product_name)
        val price: TextView = itemView.findViewById(R.id.txt_product_price)
        val quantityBadge: TextView = itemView.findViewById(R.id.txt_quantity_badge)
        val hiddenBadge: TextView? = itemView.findViewById(R.id.txt_hidden_badge)
        val checkmark: ImageView = itemView.findViewById(R.id.img_checkmark)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val layout = if (isListView) R.layout.item_product_list else R.layout.item_product_card
        val view = LayoutInflater.from(parent.context).inflate(layout, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val product = getItem(position)
        val isSelected = product.id in selectedIds

        holder.name.text = product.displayName
        holder.price.text = "CHF ${product.priceChf}"

        if (product.imageUrl != null) {
            holder.image.load(product.imageUrl) {
                crossfade(true)
                placeholder(R.drawable.ic_product_placeholder)
            }
        } else {
            // Cancel any in-flight load left over from a recycled binding,
            // otherwise a previous item's image can land on this placeholder.
            holder.image.dispose()
            holder.image.setImageResource(R.drawable.ic_product_placeholder)
        }

        // Show "X left" badge only when quantity > 1
        if (product.quantity > 1) {
            holder.quantityBadge.visibility = View.VISIBLE
            holder.quantityBadge.text = holder.itemView.context
                .getString(R.string.quantity_badge, product.quantity)
        } else {
            holder.quantityBadge.visibility = View.GONE
        }

        // Only reachable when "Show Hidden Items" is on — flags that this
        // product isn't shown in the default storefront/POS view.
        holder.hiddenBadge?.visibility = if (!product.visible) View.VISIBLE else View.GONE

        holder.checkmark.visibility = if (isSelected) View.VISIBLE else View.GONE
        holder.card.isChecked = isSelected
        holder.card.strokeWidth = if (isSelected) 6 else 0
        holder.card.strokeColor = holder.card.context.getColor(
            if (isSelected) R.color.selected_border else android.R.color.transparent
        )

        holder.card.setOnClickListener { onToggleSelect(product) }
    }

    object ProductDiff : DiffUtil.ItemCallback<Product>() {
        override fun areItemsTheSame(old: Product, new: Product) = old.id == new.id
        override fun areContentsTheSame(old: Product, new: Product) = old == new
    }
}
