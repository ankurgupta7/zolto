package ch.gwinn.pos.ui

import android.graphics.Paint
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import coil.dispose
import coil.load
import ch.gwinn.pos.R
import ch.gwinn.pos.data.PosSession
import ch.gwinn.pos.data.models.Product
import ch.gwinn.pos.logic.Money

class SaleItemAdapter(
    private val items: MutableList<Product>,
    private val onBargain: (Product) -> Unit,
    private val onRemove: (Product) -> Unit,
) : RecyclerView.Adapter<SaleItemAdapter.ViewHolder>() {

    inner class ViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        val image: ImageView = itemView.findViewById(R.id.img_sale_product)
        val name: TextView = itemView.findViewById(R.id.txt_sale_name)
        val priceOriginal: TextView = itemView.findViewById(R.id.txt_sale_price_original)
        val price: TextView = itemView.findViewById(R.id.txt_sale_price)
        val bargainBtn: TextView = itemView.findViewById(R.id.btn_bargain)
        val removeBtn: TextView = itemView.findViewById(R.id.btn_remove)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_sale, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val product = items[position]
        holder.name.text = product.displayName

        val chargedRappen = PosSession.chargedPriceRappen(product)
        val isOverridden = PosSession.priceOverrides.containsKey(product.id)
        if (isOverridden) {
            holder.priceOriginal.text = "CHF ${product.priceChf}"
            holder.priceOriginal.paintFlags = holder.priceOriginal.paintFlags or Paint.STRIKE_THRU_TEXT_FLAG
            holder.priceOriginal.visibility = View.VISIBLE
            holder.price.text = "CHF ${Money.chfString(chargedRappen)}"
        } else {
            holder.priceOriginal.visibility = View.GONE
            holder.price.text = "CHF ${product.priceChf}"
        }

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

        holder.bargainBtn.setOnClickListener { onBargain(product) }
        holder.removeBtn.setOnClickListener { onRemove(product) }
    }

    override fun getItemCount() = items.size

    fun updateItems(newItems: List<Product>) {
        // Snapshot first: the caller passes the same list instance this adapter
        // already backs onto, so clearing before copying would wipe the data.
        val snapshot = newItems.toList()
        items.clear()
        items.addAll(snapshot)
        notifyDataSetChanged()
    }
}
