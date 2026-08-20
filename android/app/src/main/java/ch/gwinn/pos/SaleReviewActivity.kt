package ch.gwinn.pos

import android.content.Intent
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.widget.EditText
import android.widget.LinearLayout
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import ch.gwinn.pos.data.PosSession
import ch.gwinn.pos.data.RetrofitClient
import ch.gwinn.pos.data.models.CustomLineItem
import ch.gwinn.pos.data.models.Product
import ch.gwinn.pos.databinding.ActivitySaleReviewBinding
import ch.gwinn.pos.logic.Money
import ch.gwinn.pos.ui.CustomItemAdapter
import ch.gwinn.pos.ui.SaleItemAdapter
import ch.gwinn.pos.viewmodel.ProductViewModel
import ch.gwinn.pos.viewmodel.ProductViewModelFactory
import kotlinx.coroutines.launch
import ch.gwinn.pos.viewmodel.UiState

class SaleReviewActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_PRODUCT_IDS = "extra_product_ids"
    }

    private lateinit var binding: ActivitySaleReviewBinding
    private lateinit var productViewModel: ProductViewModel
    private lateinit var productAdapter: SaleItemAdapter
    private lateinit var customAdapter: CustomItemAdapter
    private val saleItems = mutableListOf<Product>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySaleReviewBinding.inflate(layoutInflater)
        setContentView(binding.root)
        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        productViewModel = ViewModelProvider(
            this,
            ProductViewModelFactory(
                RetrofitClient.apiService,
                ch.gwinn.pos.data.local.DatabaseClient.getInstance(this).productDao(),
            ),
        )[ProductViewModel::class.java]

        val productIds = intent.getIntegerArrayListExtra(EXTRA_PRODUCT_IDS) ?: emptyList<Int>()

        setupRecyclerViews()
        observeProducts(productIds)
        setupListeners()
        revealTwintQrIfAvailable()
        refreshCustomItems()
    }

    private fun observeProducts(productIds: List<Int>) {
        productViewModel.products.observe(this) { state ->
            if (state is UiState.Success) {
                val selected = state.data.filter { it.id in productIds }
                saleItems.clear()
                saleItems.addAll(selected)
                productAdapter.updateItems(saleItems)
                updateTotal()
            }
        }
        productViewModel.loadProducts()
    }

    private fun setupRecyclerViews() {
        productAdapter = SaleItemAdapter(saleItems, onBargain = { product ->
            showBargainDialog(product)
        }, onRemove = { removed ->
            saleItems.remove(removed)
            productAdapter.updateItems(saleItems)
            PosSession.priceOverrides.remove(removed.id)
            updateTotal()
            finishIfEmpty()
        })
        binding.recyclerSaleItems.layoutManager = LinearLayoutManager(this)
        binding.recyclerSaleItems.isNestedScrollingEnabled = false
        binding.recyclerSaleItems.adapter = productAdapter

        customAdapter = CustomItemAdapter(PosSession.customItems) { removed ->
            PosSession.customItems.removeAll { it.id == removed.id }
            refreshCustomItems()
            finishIfEmpty()
        }
        binding.recyclerCustomItems.layoutManager = LinearLayoutManager(this)
        binding.recyclerCustomItems.isNestedScrollingEnabled = false
        binding.recyclerCustomItems.adapter = customAdapter
    }

    private fun setupListeners() {
        binding.btnAddCustomItem.setOnClickListener { showAddCustomItemDialog() }

        binding.btnCharge.setOnClickListener { launchPayment("card") }
        binding.btnCash.setOnClickListener { launchPayment("cash") }
        binding.btnTwint.setOnClickListener { launchPayment("twint") }
        binding.btnTwintQr.setOnClickListener { launchPayment("twint_qr") }
    }

    // The QR-sticker rail only exists if the merchant uploaded their sticker,
    // so the button stays hidden until the backend says there is one. Failing
    // to reach the backend leaves it hidden, which is the safe default: the
    // other three rails still work.
    private fun revealTwintQrIfAvailable() {
        lifecycleScope.launch {
            val qrUrl = try {
                RetrofitClient.apiService.getConfig().twintQrUrl
            } catch (_: Exception) {
                null
            }
            binding.btnTwintQr.visibility =
                if (!qrUrl.isNullOrBlank()) View.VISIBLE else View.GONE
        }
    }

    // Every payment method's backend endpoint resolves bargained price
    // overrides and custom items identically (PaymentViewModel reads
    // PosSession for all four), so any of "card", "cash", "twint", "twint_qr"
    // can be picked regardless of what's in the cart.
    private fun launchPayment(method: String) {
        val ids = saleItems.map { it.id }
        val totalRappen = PosSession.totalRappenFor(saleItems)
        val intent = Intent(this, PaymentActivity::class.java).apply {
            putIntegerArrayListExtra(PaymentActivity.EXTRA_PRODUCT_IDS, ArrayList(ids))
            putExtra(PaymentActivity.EXTRA_TOTAL_RAPPEN, totalRappen)
            putExtra(PaymentActivity.EXTRA_PAYMENT_METHOD, method)
        }
        startActivity(intent)
    }

    private fun showBargainDialog(product: Product) {
        val editText = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
            setText(Money.chfString(PosSession.chargedPriceRappen(product)))
        }
        val padding = (16 * resources.displayMetrics.density).toInt()
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(padding, padding, padding, padding)
            addView(editText)
        }

        AlertDialog.Builder(this)
            .setTitle(getString(R.string.bargain))
            .setMessage("Enter the bargained final price for ${product.displayName}. List price is CHF ${product.priceChf}.")
            .setView(container)
            .setPositiveButton("Save") { _, _ ->
                val rappen = Money.parseChfToRappen(editText.text.toString())
                if (rappen != null) {
                    PosSession.setPriceOverride(product.id, rappen)
                    productAdapter.updateItems(saleItems)
                    updateTotal()
                }
            }
            .setNeutralButton("Reset to List Price") { _, _ ->
                PosSession.setPriceOverride(product.id, null)
                productAdapter.updateItems(saleItems)
                updateTotal()
            }
            .setNegativeButton(getString(R.string.cancel), null)
            .show()
    }

    private fun showAddCustomItemDialog() {
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val padding = (16 * resources.displayMetrics.density).toInt()
            setPadding(padding, padding, padding, padding)
        }
        val nameInput = EditText(this).apply { hint = "Item name" }
        val priceInput = EditText(this).apply {
            hint = "Price (CHF)"
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
        }
        container.addView(nameInput)
        container.addView(priceInput)

        AlertDialog.Builder(this)
            .setTitle(getString(R.string.add_custom_item))
            .setMessage("Sell an item that isn't in the catalogue.")
            .setView(container)
            .setPositiveButton("Add") { _, _ ->
                val name = nameInput.text.toString().trim()
                val rappen = Money.parseChfToRappen(priceInput.text.toString())
                if (name.isNotEmpty() && rappen != null) {
                    PosSession.customItems.add(CustomLineItem(name = name, priceRappen = rappen))
                    refreshCustomItems()
                }
            }
            .setNegativeButton(getString(R.string.cancel), null)
            .show()
    }

    private fun refreshCustomItems() {
        customAdapter.updateItems(PosSession.customItems)
        binding.txtCustomItemsLabel.visibility = if (PosSession.customItems.isEmpty()) View.GONE else View.VISIBLE
        updateTotal()
    }

    private fun finishIfEmpty() {
        if (saleItems.isEmpty() && PosSession.customItems.isEmpty()) finish()
    }

    private fun updateTotal() {
        val totalRappen = PosSession.totalRappenFor(saleItems)
        val totalChf = "%.2f".format(totalRappen / 100.0)
        binding.txtTotal.text = getString(R.string.total_label, totalChf)
        val hasItems = saleItems.isNotEmpty() || PosSession.customItems.isNotEmpty()
        binding.btnCharge.isEnabled = hasItems
        binding.btnCash.isEnabled = hasItems
        binding.btnTwint.isEnabled = hasItems
    }

    override fun onSupportNavigateUp(): Boolean {
        onBackPressedDispatcher.onBackPressed()
        return true
    }
}
