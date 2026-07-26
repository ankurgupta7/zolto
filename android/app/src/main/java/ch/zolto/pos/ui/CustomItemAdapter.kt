package ch.zolto.pos.ui

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import ch.zolto.pos.R
import ch.zolto.pos.data.models.CustomLineItem
import ch.zolto.pos.logic.Money

class CustomItemAdapter(
    private val items: MutableList<CustomLineItem>,
    private val onRemove: (CustomLineItem) -> Unit,
) : RecyclerView.Adapter<CustomItemAdapter.ViewHolder>() {

    inner class ViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        val name: TextView = itemView.findViewById(R.id.txt_custom_name)
        val price: TextView = itemView.findViewById(R.id.txt_custom_price)
        val removeBtn: TextView = itemView.findViewById(R.id.btn_remove_custom)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_sale_custom, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val item = items[position]
        holder.name.text = item.name
        holder.price.text = "CHF ${Money.chfString(item.priceRappen)}"
        holder.removeBtn.setOnClickListener { onRemove(item) }
    }

    override fun getItemCount() = items.size

    fun updateItems(newItems: List<CustomLineItem>) {
        val snapshot = newItems.toList()
        items.clear()
        items.addAll(snapshot)
        notifyDataSetChanged()
    }
}
