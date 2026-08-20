package ch.gwinn.pos

import android.content.Intent
import android.os.Bundle
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.EditText
import android.widget.LinearLayout
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.ViewModelProvider
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.google.android.material.chip.Chip
import com.google.android.material.snackbar.Snackbar
import ch.gwinn.pos.data.PosSession
import ch.gwinn.pos.data.RetrofitClient
import ch.gwinn.pos.data.models.CustomLineItem
import ch.gwinn.pos.data.models.ProductListItem
import ch.gwinn.pos.databinding.ActivityMainBinding
import ch.gwinn.pos.logic.CategoryLogic
import ch.gwinn.pos.logic.Money
import ch.gwinn.pos.ui.ProductGridAdapter
import ch.gwinn.pos.ui.ProductSectionedAdapter
import ch.gwinn.pos.viewmodel.ProductViewModel
import ch.gwinn.pos.viewmodel.ProductViewModelFactory
import ch.gwinn.pos.viewmodel.UiState

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var viewModel: ProductViewModel

    // Flat adapter used for NEWEST and NAME sorts.
    private lateinit var flatAdapter: ProductGridAdapter
    // Sectioned adapter used for CATEGORY sort.
    private lateinit var sectionedAdapter: ProductSectionedAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayShowTitleEnabled(false)

        // Multi-tenant: this register is bound to a store (URL + POS key) via
        // SetupActivity on first launch, persisted in PosConfig.
        if (!ch.gwinn.pos.data.PosConfig.isConfigured(this)) {
            startActivity(android.content.Intent(this, SetupActivity::class.java))
            finish()
            return
        }
        RetrofitClient.init(
            ch.gwinn.pos.data.PosConfig.baseUrl(this)!!,
            ch.gwinn.pos.data.PosConfig.apiKey(this)!!,
        )

        val database = ch.gwinn.pos.data.local.DatabaseClient.getInstance(this)
        viewModel = ViewModelProvider(
            this,
            ProductViewModelFactory(
                RetrofitClient.apiService,
                database.productDao(),
                this, // context for OfflinePaymentManager
            ),
        )[ProductViewModel::class.java]

        setupRecyclerView()
        setupDiscoveryControls()
        setupObservers()
        setupListeners()

        viewModel.loadProducts()
    }

    override fun onResume() {
        super.onResume()
        viewModel.loadProducts()
    }

    private fun setupRecyclerView() {
        flatAdapter = ProductGridAdapter { product -> viewModel.toggleSelection(product.id) }
        sectionedAdapter = ProductSectionedAdapter(
            onToggleSelect = { product -> viewModel.toggleSelection(product.id) },
            onToggleCategory = { category -> viewModel.toggleCategoryExpansion(category) },
        )
        // Start with the flat adapter; the sort observer will switch if needed.
        binding.recyclerProducts.adapter = flatAdapter
        updateLayoutManager(viewModel.viewMode.value ?: ProductViewModel.ViewMode.LIST)
    }

    private fun setupDiscoveryControls() {
        // Setup Sort Spinner
        val sortOptions = arrayOf("Newest", "Category", "Name")
        val sortAdapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, sortOptions)
        sortAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        binding.spinnerSort.adapter = sortAdapter
        binding.spinnerSort.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                viewModel.setSortBy(ProductViewModel.SortMode.values()[position])
            }
            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }

        // Setup View Toggle
        binding.btnToggleView.setOnClickListener {
            val currentMode = viewModel.viewMode.value ?: ProductViewModel.ViewMode.LIST
            val newMode = if (currentMode == ProductViewModel.ViewMode.GRID)
                ProductViewModel.ViewMode.LIST else ProductViewModel.ViewMode.GRID
            viewModel.setViewMode(newMode)
        }
    }

    /**
     * True when the current sort mode requires the sectioned adapter and
     * layout manager ( CATEGORY with no active search query).
     */
    private fun isSectioned(): Boolean {
        return viewModel.sortBy.value == ProductViewModel.SortMode.CATEGORY
                && viewModel.searchQuery.value.isNullOrBlank()
    }

    private fun updateLayoutManager(mode: ProductViewModel.ViewMode) {
        val isSectioned = isSectioned()
        if (mode == ProductViewModel.ViewMode.GRID) {
            val spanCount = if (resources.configuration.screenWidthDp >= 600) 3 else 2
            val layoutManager = if (isSectioned) {
                ProductSectionedAdapter.createGridLayoutManager(this, spanCount, sectionedAdapter)
            } else {
                GridLayoutManager(this, spanCount)
            }
            binding.recyclerProducts.layoutManager = layoutManager
            // Cards are their own tiles and want breathing room around them.
            setRecyclerInset(dp(8))
            // The button shows the layout it switches to, not the current one.
            binding.btnToggleView.setImageResource(R.drawable.ic_view_list)
        } else {
            binding.recyclerProducts.layoutManager = androidx.recyclerview.widget.LinearLayoutManager(this)
            // List rows run edge to edge: side padding is width the product
            // name would rather have.
            setRecyclerInset(0)
            binding.btnToggleView.setImageResource(R.drawable.ic_view_grid)
        }
        flatAdapter.setViewMode(mode == ProductViewModel.ViewMode.LIST)
        sectionedAdapter.setViewMode(mode == ProductViewModel.ViewMode.LIST)
    }

    private fun setRecyclerInset(px: Int) {
        binding.recyclerProducts.setPadding(px, px, px, px)
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun setupObservers() {
        viewModel.products.observe(this) { state ->
            binding.swipeRefresh.isRefreshing = false
            when (state) {
                is UiState.Loading -> {
                    binding.progressBar.visibility = View.VISIBLE
                    binding.recyclerProducts.visibility = View.GONE
                    binding.txtEmpty.visibility = View.GONE
                }
                is UiState.Success -> {
                    binding.progressBar.visibility = View.GONE
                    // Grid content + empty/no-match visibility is driven by the
                    // displayItems / filteredProducts observer below.
                    renderListVisibility()
                }
                is UiState.Error -> {
                    binding.progressBar.visibility = View.GONE
                    binding.recyclerProducts.visibility = View.VISIBLE
                    Snackbar.make(binding.root, state.message, Snackbar.LENGTH_INDEFINITE)
                        .setAction(getString(R.string.retry)) { viewModel.loadProducts() }
                        .show()
                }
            }
        }

        viewModel.selectedIds.observe(this) { ids ->
            flatAdapter.setSelectedIds(ids)
            sectionedAdapter.setSelectedIds(ids)
            updateSelectionChip(ids)
        }

        // When in CATEGORY sort we show sectioned items; otherwise flat products.
        viewModel.displayItems.observe(this) { items ->
            if (isSectioned()) {
                sectionedAdapter.submitList(items)
            }
            renderListVisibility()
        }

        viewModel.filteredProducts.observe(this) { products ->
            if (!isSectioned()) {
                flatAdapter.submitList(products)
            }
            renderListVisibility()
        }

        // --- Sort mode: switch adapter and layout manager ---
        viewModel.sortBy.observe(this) {
            val wantSectioned = isSectioned()
            val currentAdapter = binding.recyclerProducts.adapter
            val needSwitch = wantSectioned && currentAdapter != sectionedAdapter
                    || !wantSectioned && currentAdapter != flatAdapter
            if (needSwitch) {
                binding.recyclerProducts.adapter = if (wantSectioned) sectionedAdapter else flatAdapter
                updateLayoutManager(viewModel.viewMode.value ?: ProductViewModel.ViewMode.LIST)
                // Re-submit data so the newly attached adapter has content immediately.
                if (wantSectioned) {
                    viewModel.displayItems.value?.let { sectionedAdapter.submitList(it) }
                } else {
                    viewModel.filteredProducts.value?.let { flatAdapter.submitList(it) }
                }
            }
        }

        // --- Search query: switching out of sectioned mode when searching ---
        viewModel.searchQuery.observe(this) {
            val wantSectioned = isSectioned()
            val currentAdapter = binding.recyclerProducts.adapter
            val needSwitch = wantSectioned && currentAdapter != sectionedAdapter
                    || !wantSectioned && currentAdapter != flatAdapter
            if (needSwitch) {
                binding.recyclerProducts.adapter = if (wantSectioned) sectionedAdapter else flatAdapter
                updateLayoutManager(viewModel.viewMode.value ?: ProductViewModel.ViewMode.LIST)
                if (wantSectioned) {
                    viewModel.displayItems.value?.let { sectionedAdapter.submitList(it) }
                } else {
                    viewModel.filteredProducts.value?.let { flatAdapter.submitList(it) }
                }
            }
        }

        viewModel.visibleCategories.observe(this) { categories ->
            buildCategoryChips(categories)
        }

        viewModel.isSyncing.observe(this) { syncing ->
            binding.progressSync.visibility = if (syncing) View.VISIBLE else View.GONE
        }

        viewModel.viewMode.observe(this) { mode ->
            updateLayoutManager(mode)
        }

        // --- Offline status indicators ---
        viewModel.isOnline.observe(this) { online ->
            binding.txtOfflineIndicator.visibility = if (online) View.GONE else View.VISIBLE
            if (!online) {
                binding.txtOfflineIndicator.text = getString(R.string.offline_cash_only)
            }
        }

        viewModel.pendingSyncCount.observe(this) { count ->
            binding.txtPendingSync.visibility = if (count > 0) View.VISIBLE else View.GONE
            if (count > 0) {
                binding.txtPendingSync.text = getString(R.string.pending_sync_count, count)
            }
        }
    }

    // Shows the grid, the "no products" empty state, or the "no matches" empty
    // state, based on the current filtered list. Only meaningful once products
    // have loaded — during Loading/Error the products observer owns visibility.
    private fun renderListVisibility() {
        if (viewModel.products.value !is UiState.Success) return
        val empty = if (isSectioned()) {
            viewModel.displayItems.value.isNullOrEmpty()
        } else {
            viewModel.filteredProducts.value.isNullOrEmpty()
        }
        binding.recyclerProducts.visibility = if (empty) View.GONE else View.VISIBLE
        binding.txtEmpty.visibility = if (empty) View.VISIBLE else View.GONE
        if (empty) {
            val hasQuery = !viewModel.searchQuery.value.isNullOrBlank()
            binding.txtEmpty.setText(
                if (hasQuery) R.string.no_matches else R.string.products_empty
            )
        }
    }

    // Rebuilds the horizontal category filter bar. Only shows when there is more
    // than one category (i.e. real, non-empty categories exist beyond "All"),
    // mirroring the website which hides categories that have no products.
    private fun buildCategoryChips(categories: List<String>) {
        val group = binding.chipGroupCategories
        binding.scrollCategories.visibility = if (categories.size > 1) View.VISIBLE else View.GONE
        if (categories.size <= 1) {
            group.removeAllViews()
            return
        }

        val selected = viewModel.selectedCategory.value ?: CategoryLogic.ALL
        group.setOnCheckedStateChangeListener(null)
        group.removeAllViews()
        categories.forEach { category ->
            val chip = layoutInflater.inflate(
                R.layout.item_category_chip, group, false
            ) as Chip
            chip.text = if (category == CategoryLogic.ALL) getString(R.string.category_all) else category
            chip.tag = category
            chip.isChecked = category == selected
            group.addView(chip)
        }
        group.setOnCheckedStateChangeListener { chipGroup, checkedIds ->
            val id = checkedIds.firstOrNull() ?: return@setOnCheckedStateChangeListener
            val chip = chipGroup.findViewById<Chip>(id) ?: return@setOnCheckedStateChangeListener
            viewModel.selectCategory(chip.tag as String)
        }
    }

    private fun setupListeners() {
        binding.swipeRefresh.setOnRefreshListener { viewModel.loadProducts() }

        binding.editSearch.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                viewModel.setSearchQuery(s?.toString() ?: "")
            }
            override fun afterTextChanged(s: Editable?) {}
        })

        binding.btnReviewSale.setOnClickListener {
            val selected = viewModel.selectedProducts()
            val intent = Intent(this, SaleReviewActivity::class.java).apply {
                putIntegerArrayListExtra(SaleReviewActivity.EXTRA_PRODUCT_IDS, ArrayList(selected.map { it.id }))
            }
            startActivity(intent)
        }
    }

    private fun updateSelectionChip(ids: Set<Int> = viewModel.selectedIds.value ?: emptySet()) {
        val customCount = PosSession.customItems.size
        val count = ids.size + customCount
        if (count == 0) {
            binding.chipSelection.visibility = View.GONE
            binding.btnReviewSale.isEnabled = false
        } else {
            val totalRappen = PosSession.totalRappenFor(viewModel.selectedProducts())
            val totalChf = "%.2f".format(totalRappen / 100.0)
            binding.chipSelection.text = "$count item(s) — CHF $totalChf"
            binding.chipSelection.visibility = View.VISIBLE
            binding.btnReviewSale.isEnabled = true
        }
    }

    // Sells something outside the catalogue entirely — the only entry point
    // that doesn't require selecting a product first.
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
                    updateSelectionChip()
                }
            }
            .setNegativeButton(getString(R.string.cancel), null)
            .show()
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.main_menu, menu)
        menu.findItem(R.id.menu_show_hidden)?.isChecked = PosSession.showHiddenItems
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            R.id.menu_sales_history -> {
                startActivity(Intent(this, SalesHistoryActivity::class.java))
                true
            }
            R.id.menu_show_hidden -> {
                val enabled = !item.isChecked
                item.isChecked = enabled
                PosSession.showHiddenItems = enabled
                viewModel.loadProducts()
                true
            }
            R.id.menu_add_custom_item -> {
                showAddCustomItemDialog()
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }
}
