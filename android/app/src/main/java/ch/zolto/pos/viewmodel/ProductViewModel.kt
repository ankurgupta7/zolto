package ch.zolto.pos.viewmodel

import android.content.Context
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ch.zolto.pos.data.ApiService
import ch.zolto.pos.data.OfflinePaymentManager
import ch.zolto.pos.data.PosSession
import ch.zolto.pos.data.local.toEntity
import ch.zolto.pos.data.models.Product
import ch.zolto.pos.data.models.ProductListItem
import ch.zolto.pos.logic.CategoryLogic
import ch.zolto.pos.logic.ProductQuery
import kotlinx.coroutines.launch

sealed class UiState<out T> {
    object Loading : UiState<Nothing>()
    data class Success<T>(val data: T) : UiState<T>()
    data class Error(val message: String) : UiState<Nothing>()
}

class ProductViewModel(
    private val api: ApiService,
    // Nullable so the ViewModel can be unit-tested without a Room database.
    private val productDao: ch.zolto.pos.data.local.ProductDao? = null,
    offlineManager: OfflinePaymentManager? = null,
) : ViewModel() {

    enum class SortMode { NEWEST, CATEGORY, NAME }
    enum class ViewMode { GRID, LIST }

    private val _products = MutableLiveData<UiState<List<Product>>>()
    val products: LiveData<UiState<List<Product>>> = _products

    private val _selectedIds = MutableLiveData<Set<Int>>(emptySet())
    val selectedIds: LiveData<Set<Int>> = _selectedIds

    // Small, visible "a database/network op is running" flag for the UI.
    private val _isSyncing = MutableLiveData(false)
    val isSyncing: LiveData<Boolean> = _isSyncing

    // --- Offline status (observed by the UI for indicator badges) ---
    private val _isOnline = MutableLiveData(true)
    val isOnline: LiveData<Boolean> = _isOnline

    private val _pendingSyncCount = MutableLiveData(0)
    val pendingSyncCount: LiveData<Int> = _pendingSyncCount

    // Canonical category order + fold map from the website (single source of
    // truth). Empty until the first successful categories fetch.
    private var canonicalCategories: List<String> = emptyList()
    private var extraIncludes: Map<String, List<String>> = emptyMap()

    private val _selectedCategory = MutableLiveData(CategoryLogic.ALL)
    val selectedCategory: LiveData<String> = _selectedCategory

    private val _searchQuery = MutableLiveData("")
    val searchQuery: LiveData<String> = _searchQuery

    // Category chips to display: "All" + only non-empty categories, in order.
    private val _visibleCategories = MutableLiveData(listOf(CategoryLogic.ALL))
    val visibleCategories: LiveData<List<String>> = _visibleCategories

    // Products after applying the search query + selected-category filter.
    private val _filteredProducts = MutableLiveData<List<Product>>(emptyList())
    val filteredProducts: LiveData<List<Product>> = _filteredProducts

    // Sectioned or flat list for the RecyclerView.
    // When sorted by CATEGORY this contains Header + ProductItem rows;
    // otherwise it contains only ProductItem wrappers.
    private val _displayItems = MutableLiveData<List<ProductListItem>>(emptyList())
    val displayItems: LiveData<List<ProductListItem>> = _displayItems

    private val _sortBy = MutableLiveData(SortMode.NEWEST)
    val sortBy: LiveData<SortMode> = _sortBy

    private val _viewMode = MutableLiveData(ViewMode.GRID)
    val viewMode: LiveData<ViewMode> = _viewMode

    private val _expandedCategories = MutableLiveData<Set<String>>(emptySet())
    val expandedCategories: LiveData<Set<String>> = _expandedCategories

    init {
        // Observe connectivity and pending sync count from the offline manager
        offlineManager?.let { mgr ->
            viewModelScope.launch {
                mgr.isOnline.collect { online -> _isOnline.postValue(online) }
            }
            viewModelScope.launch {
                mgr.pendingCountFlow.collect { count -> _pendingSyncCount.postValue(count) }
            }
        }
    }

    /**
     * Loads products cache-first: any cached products are shown immediately so
     * the grid never blanks on refresh, while the network fetch runs in the
     * background. The full-screen spinner appears only when there is nothing
     * cached to show. [isSyncing] stays true for the whole read/fetch/write
     * cycle so the UI can surface that a database op is in flight.
     */
    fun loadProducts() {
        viewModelScope.launch {
            _isSyncing.value = true
            try {
                // 1. Show cache immediately if we have nothing on screen yet.
                if (_products.value !is UiState.Success) {
                    val cached = productDao?.getAllProducts()?.map { it.toProduct() } ?: emptyList()
                    if (cached.isNotEmpty()) onProductsLoaded(cached) else _products.value = UiState.Loading
                }

                // 2. Refresh the canonical category config (best-effort).
                try {
                    val cats = api.getCategories()
                    canonicalCategories = cats.categories
                    extraIncludes = cats.extraIncludes
                } catch (_: Exception) {
                    // Keep whatever we had; visibleCategories degrades gracefully.
                }

                // 3. Fetch the live catalogue and refresh the offline cache.
                try {
                    val list = api.getProducts(includeHidden = PosSession.showHiddenItems)
                    productDao?.deleteAllProducts()
                    productDao?.insertProducts(list.map { it.toEntity() })
                    onProductsLoaded(list)

                    val availableIds = list.map { it.id }.toSet()
                    _selectedIds.value = (_selectedIds.value ?: emptySet()) intersect availableIds
                } catch (e: Exception) {
                    // Network failed. Keep showing cache if we already have it;
                    // otherwise surface the error.
                    if (_products.value !is UiState.Success) {
                        val localProducts = productDao?.getAllProducts()?.map { it.toProduct() } ?: emptyList()
                        if (localProducts.isNotEmpty()) {
                            onProductsLoaded(localProducts)
                        } else {
                            _products.value = UiState.Error(e.message ?: "Unknown error")
                        }
                    }
                }
            } finally {
                _isSyncing.value = false
            }
        }
    }

    private fun onProductsLoaded(list: List<Product>) {
        _products.value = UiState.Success(list)
        val present = list.mapNotNull { it.category }.toSet()
        val visible = CategoryLogic.visibleCategories(canonicalCategories, present)
        _visibleCategories.value = visible
        // Expand all categories by default so the user sees everything first.
        _expandedCategories.value = present.toSet()
        // Keep the current selection only if it still has products; else reset.
        if (_selectedCategory.value !in visible) {
            _selectedCategory.value = CategoryLogic.ALL
        }
        applyFilter()
    }

    fun selectCategory(category: String) {
        if (_selectedCategory.value == category) return
        _selectedCategory.value = category
        applyFilter()
    }

    fun setSearchQuery(query: String) {
        if (_searchQuery.value == query) return
        _searchQuery.value = query
        applyFilter()
    }

    fun setSortBy(mode: SortMode) {
        if (_sortBy.value == mode) return
        _sortBy.value = mode
        applyFilter()
    }

    fun setViewMode(mode: ViewMode) {
        if (_viewMode.value == mode) return
        _viewMode.value = mode
    }

    fun toggleCategoryExpansion(category: String) {
        val current = _expandedCategories.value ?: emptySet()
        _expandedCategories.value = if (category in current) current - category else current + category
        applyFilter()
    }

    private fun applyFilter() {
        val state = _products.value
        val all = if (state is UiState.Success) state.data else emptyList()
        val filtered = ProductQuery.apply(
            items = all,
            categoryOf = { it.category },
            searchableTextOf = { it.searchableText },
            category = _selectedCategory.value ?: CategoryLogic.ALL,
            query = _searchQuery.value ?: "",
            extraIncludes = extraIncludes,
        )

        val sorted = when (_sortBy.value) {
            SortMode.NEWEST -> filtered.sortedByDescending { it.id }
            SortMode.CATEGORY -> filtered.sortedWith(compareBy({ it.category ?: "" }, { it.displayName }))
            SortMode.NAME -> filtered.sortedBy { it.displayName }
            else -> filtered
        }

        _filteredProducts.value = sorted
        _displayItems.value = buildDisplayItems(sorted)
    }

    /**
     * Builds the RecyclerView items from the sorted product list.
     *
     * When sorted by CATEGORY with no active search, products are grouped into
     * collapsible sections: a [CategoryHeader] followed by the [ProductItem]s
     * in that category (only when the category is expanded).
     *
     * For other sorts or when searching, returns a flat list of [ProductItem]
     * wrappers so the existing [ProductGridAdapter] can also consume the raw
     * [_filteredProducts] list if needed.
     */
    private fun buildDisplayItems(sorted: List<Product>): List<ProductListItem> {
        if (_sortBy.value != SortMode.CATEGORY || !(_searchQuery.value.isNullOrBlank())) {
            return sorted.map { ProductListItem.ProductItem(it) }
        }

        val expanded = _expandedCategories.value ?: emptySet()
        // Order sections by canonical category list so they always appear
        // in the same sequence (Necklaces, Earrings, Sets, Rings, ...).
        val presentCategories = sorted.mapNotNull { it.category }.distinct()
        val orderedCategories = if (canonicalCategories.isNotEmpty()) {
            canonicalCategories.filter { it in presentCategories }
        } else {
            presentCategories
        }

        val items = mutableListOf<ProductListItem>()
        for (category in orderedCategories) {
            val categoryProducts = sorted.filter { it.category == category }
            if (categoryProducts.isEmpty()) continue
            val isExpanded = category in expanded
            items.add(
                ProductListItem.CategoryHeader(
                    category = category,
                    count = categoryProducts.size,
                    isExpanded = isExpanded,
                )
            )
            if (isExpanded) {
                items.addAll(categoryProducts.map { ProductListItem.ProductItem(it) })
            }
        }
        return items
    }

    fun toggleSelection(productId: Int) {
        val current = _selectedIds.value ?: emptySet()
        _selectedIds.value = if (productId in current) current - productId else current + productId
    }

    fun clearSelection() {
        _selectedIds.value = emptySet()
    }

    fun selectedProducts(): List<Product> {
        val state = _products.value
        if (state !is UiState.Success) return emptyList()
        val ids = _selectedIds.value ?: emptySet()
        return state.data.filter { it.id in ids }
    }

    fun totalRappen(): Int = selectedProducts().sumOf { it.priceRappen }
}
