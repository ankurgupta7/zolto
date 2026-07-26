package ch.zolto.pos

import androidx.arch.core.executor.testing.InstantTaskExecutorRule
import ch.zolto.pos.data.ApiService
import ch.zolto.pos.data.models.SaleItem
import ch.zolto.pos.data.models.SaleSummary
import ch.zolto.pos.viewmodel.SalesHistoryViewModel
import ch.zolto.pos.viewmodel.UiState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever

@OptIn(ExperimentalCoroutinesApi::class)
class SalesHistoryViewModelTest {

    @get:Rule
    val instantTaskExecutorRule = InstantTaskExecutorRule()

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var api: ApiService
    private lateinit var viewModel: SalesHistoryViewModel

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        api = mock()
        viewModel = SalesHistoryViewModel(api)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun makeSale(id: Int) = SaleSummary(
        id = id,
        status = "paid",
        totalRappen = 12000,
        totalChf = "120.00",
        createdAt = "2025-01-01T12:00:00",
        items = listOf(
            SaleItem(
                productId = 1,
                productName = "Ring",
                priceRappen = 12000,
            )
        ),
    )

    @Test
    fun `loadSales sets Loading then Success`() = runTest {
        val sales = listOf(makeSale(1), makeSale(2))
        whenever(api.getSalesHistory()).thenReturn(sales)

        viewModel.loadSales()
        assertTrue(viewModel.sales.value is UiState.Loading)

        advanceUntilIdle()
        val state = viewModel.sales.value
        assertTrue(state is UiState.Success)
        assertEquals(2, (state as UiState.Success).data.size)
    }

    @Test
    fun `loadSales returns empty list`() = runTest {
        whenever(api.getSalesHistory()).thenReturn(emptyList())

        viewModel.loadSales()
        advanceUntilIdle()

        val state = viewModel.sales.value
        assertTrue(state is UiState.Success)
        assertEquals(0, (state as UiState.Success).data.size)
    }

    @Test
    fun `loadSales sets Error on failure`() = runTest {
        whenever(api.getSalesHistory()).thenThrow(RuntimeException("503"))

        viewModel.loadSales()
        advanceUntilIdle()

        val state = viewModel.sales.value
        assertTrue(state is UiState.Error)
    }

    @Test
    fun `loadSales toggles isSyncing during the load`() = runTest {
        whenever(api.getSalesHistory()).thenReturn(listOf(makeSale(1)))

        viewModel.loadSales()
        assertEquals(true, viewModel.isSyncing.value)

        advanceUntilIdle()
        assertEquals(false, viewModel.isSyncing.value)
    }

    @Test
    fun `a custom (non-inventory) sale item has no productId but still has a display name`() = runTest {
        val sale = SaleSummary(
            id = 1,
            status = "paid",
            totalRappen = 1500,
            totalChf = "15.00",
            createdAt = "2025-01-01T12:00:00",
            items = listOf(SaleItem(productId = null, productName = "Custom repair fee", priceRappen = 1500)),
        )
        whenever(api.getSalesHistory()).thenReturn(listOf(sale))

        viewModel.loadSales()
        advanceUntilIdle()

        val state = viewModel.sales.value
        assertTrue(state is UiState.Success)
        val item = (state as UiState.Success).data.first().items.first()
        assertEquals(null, item.productId)
        assertEquals("Custom repair fee", item.displayName)
    }
}
