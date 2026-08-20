package ch.gwinn.pos

import androidx.arch.core.executor.testing.InstantTaskExecutorRule
import ch.gwinn.pos.data.ApiService
import ch.gwinn.pos.data.PosSession
import ch.gwinn.pos.data.models.CategoriesResponse
import ch.gwinn.pos.data.models.Product
import ch.gwinn.pos.data.models.ProductListItem
import ch.gwinn.pos.viewmodel.ProductViewModel
import ch.gwinn.pos.viewmodel.UiState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

@OptIn(ExperimentalCoroutinesApi::class)
class ProductViewModelTest {

    @get:Rule
    val instantTaskExecutorRule = InstantTaskExecutorRule()

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var api: ApiService
    private lateinit var viewModel: ProductViewModel

    private val canonicalCategories = listOf(
        "Necklaces", "Earrings", "Sets", "Rings", "Bracelets",
        "Bangles", "Anklets", "Brooches", "Hair Accessories", "Other",
    )

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        PosSession.showHiddenItems = false
        api = mock()
        // Default category config so loadProducts' getCategories() call succeeds.
        runBlocking {
            whenever(api.getCategories()).thenReturn(
                CategoriesResponse(
                    categories = canonicalCategories,
                    extraIncludes = mapOf(
                        "Necklaces" to listOf("Sets"),
                        "Earrings" to listOf("Sets"),
                    ),
                )
            )
        }
        viewModel = ProductViewModel(api)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
        PosSession.showHiddenItems = false
    }

    private fun makeProduct(
        id: Int,
        name: String,
        priceRappen: Int = 10000,
        category: String? = null,
        description: String? = null,
    ) = Product(
        id = id,
        name = name,
        nameEn = null,
        price = null,
        priceRappen = priceRappen,
        category = category,
        imageUrl = null,
        imageKey = null,
        quantity = 1,
        description = description,
    )

    @Test
    fun `loadProducts ends in Success and clears syncing`() = runTest {
        val products = listOf(makeProduct(1, "Ring"))
        whenever(api.getProducts()).thenReturn(products)

        viewModel.loadProducts()
        advanceUntilIdle()
        assertEquals(false, viewModel.isSyncing.value)
        val state = viewModel.products.value
        assertTrue(state is UiState.Success)
        assertEquals(1, (state as UiState.Success).data.size)
    }

    @Test
    fun `loadProducts requests includeHidden=false by default`() = runTest {
        whenever(api.getProducts(eq(false))).thenReturn(emptyList())

        viewModel.loadProducts()
        advanceUntilIdle()

        verify(api).getProducts(eq(false))
    }

    @Test
    fun `loadProducts requests includeHidden=true when Show Hidden Items is on`() = runTest {
        PosSession.showHiddenItems = true
        whenever(api.getProducts(eq(true))).thenReturn(emptyList())

        viewModel.loadProducts()
        advanceUntilIdle()

        verify(api).getProducts(eq(true))
    }

    @Test
    fun `loadProducts sets Error on exception`() = runTest {
        whenever(api.getProducts()).thenThrow(RuntimeException("Network error"))

        viewModel.loadProducts()
        advanceUntilIdle()

        val state = viewModel.products.value
        assertTrue(state is UiState.Error)
        assertTrue((state as UiState.Error).message.contains("Network error"))
    }

    @Test
    fun `toggleSelection adds and removes product`() {
        viewModel.toggleSelection(1)
        assertTrue(viewModel.selectedIds.value!!.contains(1))

        viewModel.toggleSelection(1)
        assertFalse(viewModel.selectedIds.value!!.contains(1))
    }

    @Test
    fun `toggleSelection supports multiple selections`() {
        viewModel.toggleSelection(1)
        viewModel.toggleSelection(2)
        viewModel.toggleSelection(3)

        assertEquals(setOf(1, 2, 3), viewModel.selectedIds.value)
    }

    @Test
    fun `clearSelection empties selected set`() {
        viewModel.toggleSelection(1)
        viewModel.toggleSelection(2)
        viewModel.clearSelection()

        assertEquals(emptySet<Int>(), viewModel.selectedIds.value)
    }

    @Test
    fun `totalRappen sums selected product prices`() = runTest {
        val products = listOf(
            makeProduct(1, "Ring", priceRappen = 12000),
            makeProduct(2, "Earring", priceRappen = 8000),
        )
        whenever(api.getProducts()).thenReturn(products)
        viewModel.loadProducts()
        advanceUntilIdle()

        viewModel.toggleSelection(1)
        viewModel.toggleSelection(2)

        assertEquals(20000, viewModel.totalRappen())
    }

    @Test
    fun `selectedProducts returns only selected items`() = runTest {
        val products = listOf(
            makeProduct(1, "Ring"),
            makeProduct(2, "Necklace"),
            makeProduct(3, "Bracelet"),
        )
        whenever(api.getProducts()).thenReturn(products)
        viewModel.loadProducts()
        advanceUntilIdle()

        viewModel.toggleSelection(1)
        viewModel.toggleSelection(3)

        val selected = viewModel.selectedProducts()
        assertEquals(2, selected.size)
        assertTrue(selected.any { it.id == 1 })
        assertTrue(selected.any { it.id == 3 })
        assertFalse(selected.any { it.id == 2 })
    }

    @Test
    fun `loadProducts removes unavailable products from selection`() = runTest {
        val initialProducts = listOf(makeProduct(1, "Ring"), makeProduct(2, "Necklace"))
        whenever(api.getProducts()).thenReturn(initialProducts)
        viewModel.loadProducts()
        advanceUntilIdle()

        viewModel.toggleSelection(1)
        viewModel.toggleSelection(2)
        assertEquals(setOf(1, 2), viewModel.selectedIds.value)

        // Reload with only product 1 available
        val updatedProducts = listOf(makeProduct(1, "Ring"))
        whenever(api.getProducts()).thenReturn(updatedProducts)
        viewModel.loadProducts()
        advanceUntilIdle()

        assertEquals(setOf(1), viewModel.selectedIds.value)
    }

    // ── Category filtering ────────────────────────────────────────────────────

    @Test
    fun `visibleCategories lists All plus only non-empty categories in canonical order`() = runTest {
        val products = listOf(
            makeProduct(1, "Ring", category = "Rings"),
            makeProduct(2, "Necklace", category = "Necklaces"),
        )
        whenever(api.getProducts()).thenReturn(products)
        viewModel.loadProducts()
        advanceUntilIdle()

        // Necklaces precedes Rings in the canonical order; empty categories hidden.
        assertEquals(listOf("All", "Necklaces", "Rings"), viewModel.visibleCategories.value)
    }

    @Test
    fun `filteredProducts defaults to all products`() = runTest {
        val products = listOf(
            makeProduct(1, "Ring", category = "Rings"),
            makeProduct(2, "Necklace", category = "Necklaces"),
        )
        whenever(api.getProducts()).thenReturn(products)
        viewModel.loadProducts()
        advanceUntilIdle()

        assertEquals(setOf(1, 2), viewModel.filteredProducts.value!!.map { it.id }.toSet())
    }

    @Test
    fun `selectCategory filters products to that category`() = runTest {
        val products = listOf(
            makeProduct(1, "Ring", category = "Rings"),
            makeProduct(2, "Necklace", category = "Necklaces"),
        )
        whenever(api.getProducts()).thenReturn(products)
        viewModel.loadProducts()
        advanceUntilIdle()

        viewModel.selectCategory("Rings")
        assertEquals(listOf(1), viewModel.filteredProducts.value!!.map { it.id })
    }

    @Test
    fun `selecting Necklaces folds in Sets products`() = runTest {
        val products = listOf(
            makeProduct(1, "Necklace", category = "Necklaces"),
            makeProduct(2, "Set", category = "Sets"),
            makeProduct(3, "Ring", category = "Rings"),
        )
        whenever(api.getProducts()).thenReturn(products)
        viewModel.loadProducts()
        advanceUntilIdle()

        viewModel.selectCategory("Necklaces")
        assertEquals(setOf(1, 2), viewModel.filteredProducts.value!!.map { it.id }.toSet())
    }

    @Test
    fun `reload resets selected category when it becomes empty`() = runTest {
        val initial = listOf(
            makeProduct(1, "Ring", category = "Rings"),
            makeProduct(2, "Necklace", category = "Necklaces"),
        )
        whenever(api.getProducts()).thenReturn(initial)
        viewModel.loadProducts()
        advanceUntilIdle()
        viewModel.selectCategory("Rings")
        assertEquals("Rings", viewModel.selectedCategory.value)

        // Rings sell out — only necklaces remain.
        whenever(api.getProducts()).thenReturn(listOf(makeProduct(2, "Necklace", category = "Necklaces")))
        viewModel.loadProducts()
        advanceUntilIdle()

        assertEquals("All", viewModel.selectedCategory.value)
        assertEquals(listOf(2), viewModel.filteredProducts.value!!.map { it.id })
    }

    @Test
    fun `category config fetch failure still hides empty categories`() = runTest {
        whenever(api.getCategories()).thenThrow(RuntimeException("offline"))
        val products = listOf(
            makeProduct(1, "Ring", category = "Rings"),
            makeProduct(2, "Necklace", category = "Necklaces"),
        )
        whenever(api.getProducts()).thenReturn(products)
        viewModel.loadProducts()
        advanceUntilIdle()

        val visible = viewModel.visibleCategories.value!!
        assertEquals("All", visible.first())
        assertEquals(setOf("All", "Rings", "Necklaces"), visible.toSet())
    }

    // ── Search ────────────────────────────────────────────────────────────────

    @Test
    fun `search finds products across all categories`() = runTest {
        val products = listOf(
            makeProduct(1, "Gold Ring", category = "Rings"),
            makeProduct(2, "Silver Necklace", category = "Necklaces"),
        )
        whenever(api.getProducts()).thenReturn(products)
        viewModel.loadProducts()
        advanceUntilIdle()

        // Browsing Rings, but a search for the necklace still surfaces it.
        viewModel.selectCategory("Rings")
        viewModel.setSearchQuery("necklace")
        assertEquals(listOf(2), viewModel.filteredProducts.value!!.map { it.id })
    }

    @Test
    fun `search matches description and price`() = runTest {
        val products = listOf(
            makeProduct(1, "Ring", category = "Rings", description = "handmade emerald"),
            makeProduct(2, "Necklace", category = "Necklaces", priceRappen = 25000),
        )
        whenever(api.getProducts()).thenReturn(products)
        viewModel.loadProducts()
        advanceUntilIdle()

        viewModel.setSearchQuery("emerald")
        assertEquals(listOf(1), viewModel.filteredProducts.value!!.map { it.id })

        viewModel.setSearchQuery("250.00")
        assertEquals(listOf(2), viewModel.filteredProducts.value!!.map { it.id })
    }

    @Test
    fun `clearing search returns to category browsing`() = runTest {
        val products = listOf(
            makeProduct(1, "Ring", category = "Rings"),
            makeProduct(2, "Necklace", category = "Necklaces"),
        )
        whenever(api.getProducts()).thenReturn(products)
        viewModel.loadProducts()
        advanceUntilIdle()

        viewModel.selectCategory("Rings")
        viewModel.setSearchQuery("necklace")
        assertEquals(listOf(2), viewModel.filteredProducts.value!!.map { it.id })

        viewModel.setSearchQuery("")
        assertEquals(listOf(1), viewModel.filteredProducts.value!!.map { it.id })
    }

    // ── Cache-first loading ───────────────────────────────────────────────────

    @Test
    fun `network failure with cache keeps showing cached products, not error`() = runTest {
        val dao = mock<ch.gwinn.pos.data.local.ProductDao>()
        val cached = listOf(
            ch.gwinn.pos.data.local.ProductEntity(
                id = 7, name = "Cached Ring", nameEn = null, price = null,
                priceRappen = 5000, category = "Rings", imageUrl = null,
                imageKey = null, quantity = 1,
            )
        )
        whenever(dao.getAllProducts()).thenReturn(cached)
        whenever(api.getProducts()).thenThrow(RuntimeException("offline"))
        val vm = ProductViewModel(api, dao)

        vm.loadProducts()
        advanceUntilIdle()

        val state = vm.products.value
        assertTrue(state is UiState.Success)
        assertEquals(listOf(7), (state as UiState.Success).data.map { it.id })
        assertEquals(false, vm.isSyncing.value)
    }

    // ── Category-grouped displayItems ────────────────────────────────────────

    @Test
    fun `displayItems is flat ProductItem wrappers for NEWEST sort`() = runTest {
        val products = listOf(
            makeProduct(1, "Ring", category = "Rings"),
            makeProduct(2, "Necklace", category = "Necklaces"),
        )
        whenever(api.getProducts()).thenReturn(products)
        viewModel.loadProducts()
        advanceUntilIdle()

        val items = viewModel.displayItems.value!!
        assertEquals(2, items.size)
        assertTrue(items[0] is ProductListItem.ProductItem)
        assertTrue(items[1] is ProductListItem.ProductItem)
        // NEWEST sorts by id descending, so product 2 comes before product 1.
        assertEquals(listOf(2, 1), items.filterIsInstance<ProductListItem.ProductItem>().map { it.product.id })
    }

    @Test
    fun `displayItems is flat ProductItem wrappers for NAME sort`() = runTest {
        val products = listOf(
            makeProduct(1, "Ring", category = "Rings"),
            makeProduct(2, "Necklace", category = "Necklaces"),
        )
        whenever(api.getProducts()).thenReturn(products)
        viewModel.loadProducts()
        advanceUntilIdle()

        viewModel.setSortBy(ProductViewModel.SortMode.NAME)
        advanceUntilIdle()

        val items = viewModel.displayItems.value!!
        assertTrue(items.all { it is ProductListItem.ProductItem })
    }

    @Test
    fun `displayItems has CategoryHeader sections for CATEGORY sort`() = runTest {
        val products = listOf(
            makeProduct(1, "Necklace", category = "Necklaces"),
            makeProduct(2, "Ring A", category = "Rings"),
            makeProduct(3, "Ring B", category = "Rings"),
        )
        whenever(api.getProducts()).thenReturn(products)
        viewModel.loadProducts()
        advanceUntilIdle()

        viewModel.setSortBy(ProductViewModel.SortMode.CATEGORY)
        advanceUntilIdle()

        val items = viewModel.displayItems.value!!
        // Expected: Header(Necklaces,1), Product(1), Header(Rings,2), Product(2), Product(3)
        assertEquals(5, items.size)

        val header0 = items[0] as ProductListItem.CategoryHeader
        assertEquals("Necklaces", header0.category)
        assertEquals(1, header0.count)
        assertEquals(true, header0.isExpanded)

        assertTrue(items[1] is ProductListItem.ProductItem)
        assertEquals(1, (items[1] as ProductListItem.ProductItem).product.id)

        val header2 = items[2] as ProductListItem.CategoryHeader
        assertEquals("Rings", header2.category)
        assertEquals(2, header2.count)
        assertEquals(true, header2.isExpanded)

        assertTrue(items[3] is ProductListItem.ProductItem)
        assertTrue(items[4] is ProductListItem.ProductItem)
    }

    @Test
    fun `displayItems sections follow canonical category order`() = runTest {
        val products = listOf(
            makeProduct(1, "Ring", category = "Rings"),       // Rings comes after Necklaces
            makeProduct(2, "Necklace", category = "Necklaces"),
        )
        whenever(api.getProducts()).thenReturn(products)
        viewModel.loadProducts()
        advanceUntilIdle()

        viewModel.setSortBy(ProductViewModel.SortMode.CATEGORY)
        advanceUntilIdle()

        val items = viewModel.displayItems.value!!
        // Necklaces should come before Rings in canonical order.
        val header0 = items[0] as ProductListItem.CategoryHeader
        assertEquals("Necklaces", header0.category)
        val header1 = items[2] as ProductListItem.CategoryHeader
        assertEquals("Rings", header1.category)
    }

    @Test
    fun `displayItems reverts to flat list when searching in CATEGORY sort`() = runTest {
        val products = listOf(
            makeProduct(1, "Necklace", category = "Necklaces"),
            makeProduct(2, "Ring", category = "Rings"),
        )
        whenever(api.getProducts()).thenReturn(products)
        viewModel.loadProducts()
        advanceUntilIdle()

        viewModel.setSortBy(ProductViewModel.SortMode.CATEGORY)
        advanceUntilIdle()

        // Initially sectioned
        val sectioned = viewModel.displayItems.value!!
        assertTrue(sectioned.any { it is ProductListItem.CategoryHeader })

        // Search — should revert to flat
        viewModel.setSearchQuery("ring")
        advanceUntilIdle()

        val flat = viewModel.displayItems.value!!
        assertTrue(flat.all { it is ProductListItem.ProductItem })
        assertEquals(listOf(2), flat.map { (it as ProductListItem.ProductItem).product.id })
    }

    @Test
    fun `collapsing a category hides its products from displayItems`() = runTest {
        val products = listOf(
            makeProduct(1, "Necklace", category = "Necklaces"),
            makeProduct(2, "Ring", category = "Rings"),
        )
        whenever(api.getProducts()).thenReturn(products)
        viewModel.loadProducts()
        advanceUntilIdle()

        viewModel.setSortBy(ProductViewModel.SortMode.CATEGORY)
        advanceUntilIdle()

        // All expanded by default
        val expanded = viewModel.displayItems.value!!
        assertEquals(4, expanded.size) // 2 headers + 2 products

        // Collapse Necklaces
        viewModel.toggleCategoryExpansion("Necklaces")
        advanceUntilIdle()

        val collapsed = viewModel.displayItems.value!!
        assertEquals(3, collapsed.size) // 2 headers + 1 product (Rings)
        val necklacesHeader = collapsed[0] as ProductListItem.CategoryHeader
        assertEquals(false, necklacesHeader.isExpanded)
    }

    @Test
    fun `expandedCategories initialized to all present categories on load`() = runTest {
        val products = listOf(
            makeProduct(1, "Necklace", category = "Necklaces"),
            makeProduct(2, "Ring", category = "Rings"),
        )
        whenever(api.getProducts()).thenReturn(products)
        viewModel.loadProducts()
        advanceUntilIdle()

        assertEquals(setOf("Necklaces", "Rings"), viewModel.expandedCategories.value)
    }
}
