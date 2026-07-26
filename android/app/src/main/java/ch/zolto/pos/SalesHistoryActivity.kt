package ch.zolto.pos

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.ViewModelProvider
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import ch.zolto.pos.data.RetrofitClient
import ch.zolto.pos.data.models.SaleSummary
import ch.zolto.pos.databinding.ActivitySalesHistoryBinding
import ch.zolto.pos.viewmodel.SalesHistoryViewModel
import ch.zolto.pos.viewmodel.SalesHistoryViewModelFactory
import ch.zolto.pos.viewmodel.UiState

class SalesHistoryActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySalesHistoryBinding
    private lateinit var viewModel: SalesHistoryViewModel

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySalesHistoryBinding.inflate(layoutInflater)
        setContentView(binding.root)
        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        val database = ch.zolto.pos.data.local.DatabaseClient.getInstance(this)
        viewModel = ViewModelProvider(
            this,
            SalesHistoryViewModelFactory(RetrofitClient.apiService, database.salesDao()),
        )[SalesHistoryViewModel::class.java]

        val adapter = SalesHistoryAdapter(emptyList())
        binding.recyclerSales.layoutManager = LinearLayoutManager(this)
        binding.recyclerSales.adapter = adapter

        viewModel.sales.observe(this) { state ->
            binding.swipeRefresh.isRefreshing = false
            when (state) {
                is UiState.Loading -> {
                    binding.progressBar.visibility = View.VISIBLE
                    binding.txtEmpty.visibility = View.GONE
                }
                is UiState.Success -> {
                    binding.progressBar.visibility = View.GONE
                    if (state.data.isEmpty()) {
                        binding.txtEmpty.visibility = View.VISIBLE
                    } else {
                        binding.txtEmpty.visibility = View.GONE
                        adapter.updateSales(state.data)
                    }
                }
                is UiState.Error -> {
                    binding.progressBar.visibility = View.GONE
                    binding.txtEmpty.text = state.message
                    binding.txtEmpty.visibility = View.VISIBLE
                }
            }
        }

        viewModel.isSyncing.observe(this) { syncing ->
            binding.progressSync.visibility = if (syncing) View.VISIBLE else View.GONE
        }

        binding.swipeRefresh.setOnRefreshListener { viewModel.loadSales() }
        viewModel.loadSales()
    }

    override fun onSupportNavigateUp(): Boolean {
        onBackPressedDispatcher.onBackPressed()
        return true
    }
}

private class SalesHistoryAdapter(
    private var sales: List<SaleSummary>,
) : RecyclerView.Adapter<SalesHistoryAdapter.ViewHolder>() {

    inner class ViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        val txtDate: TextView = itemView.findViewById(R.id.txt_sale_date)
        val txtTotal: TextView = itemView.findViewById(R.id.txt_sale_total)
        val txtItems: TextView = itemView.findViewById(R.id.txt_sale_items)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_sale_history, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val sale = sales[position]
        holder.txtDate.text = sale.createdAt
        val methodLabel = when (sale.paymentMethod) {
            "cash" -> "Cash"
            "twint" -> "TWINT"
            else -> "Card"
        }
        holder.txtTotal.text = "CHF ${sale.totalChf} · $methodLabel"
        holder.txtItems.text = sale.items.joinToString(", ") { it.displayName }
    }

    override fun getItemCount() = sales.size

    fun updateSales(newSales: List<SaleSummary>) {
        sales = newSales
        notifyDataSetChanged()
    }
}
