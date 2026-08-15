package ch.zolto.pos

import androidx.arch.core.executor.testing.InstantTaskExecutorRule
import ch.zolto.pos.data.ApiService
import ch.zolto.pos.data.ViewModeStore
import ch.zolto.pos.logic.ViewModePreference
import ch.zolto.pos.viewmodel.ProductViewModel
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.mock

/**
 * The product picker's layout: which one it opens in, and that a cashier's
 * choice is remembered across launches.
 */
class ProductViewModeTest {

    @get:Rule
    val instantTaskExecutorRule = InstantTaskExecutorRule()

    /** Stands in for SharedPreferences. */
    private class FakeStore(var stored: String? = null) : ViewModeStore {
        override fun read(): String? = stored

        override fun write(value: String) {
            stored = value
        }
    }

    private fun viewModel(store: ViewModeStore) =
        ProductViewModel(mock<ApiService>(), null, null, store)

    @Test
    fun `a fresh install opens in the list`() {
        assertEquals(ProductViewModel.ViewMode.LIST, viewModel(FakeStore()).viewMode.value)
    }

    @Test
    fun `with no store at all it still opens in the list`() {
        assertEquals(ProductViewModel.ViewMode.LIST, viewModel(ViewModeStore.None).viewMode.value)
    }

    @Test
    fun `a stored choice is restored on the next launch`() {
        val store = FakeStore(ProductViewModel.ViewMode.GRID.name)
        assertEquals(ProductViewModel.ViewMode.GRID, viewModel(store).viewMode.value)
    }

    // A value written by an older build must not crash ViewMode.valueOf().
    @Test
    fun `an unreadable stored value falls back to the list`() {
        assertEquals(ProductViewModel.ViewMode.LIST, viewModel(FakeStore("CAROUSEL")).viewMode.value)
    }

    @Test
    fun `switching layout writes the choice through`() {
        val store = FakeStore()
        val vm = viewModel(store)

        vm.setViewMode(ProductViewModel.ViewMode.GRID)
        assertEquals(ProductViewModel.ViewMode.GRID, vm.viewMode.value)
        assertEquals(ProductViewModel.ViewMode.GRID.name, store.stored)

        vm.setViewMode(ProductViewModel.ViewMode.LIST)
        assertEquals(ProductViewModel.ViewMode.LIST.name, store.stored)
    }

    // The ViewModel's enum names and the storage rule's constants have to stay
    // in step — they are what round-trips through SharedPreferences.
    @Test
    fun `enum names match the stored constants`() {
        assertEquals(ViewModePreference.GRID, ProductViewModel.ViewMode.GRID.name)
        assertEquals(ViewModePreference.LIST, ProductViewModel.ViewMode.LIST.name)
    }
}
