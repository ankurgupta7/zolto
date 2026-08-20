package ch.gwinn.pos.viewmodel

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ch.gwinn.pos.data.ApiService
import ch.gwinn.pos.data.local.toEntity
import ch.gwinn.pos.data.models.SaleSummary
import kotlinx.coroutines.launch

class SalesHistoryViewModel(
    private val api: ApiService,
    // Nullable so the ViewModel can be unit-tested without a Room database.
    private val salesDao: ch.gwinn.pos.data.local.SalesDao? = null
) : ViewModel() {

    private val _sales = MutableLiveData<UiState<List<SaleSummary>>>()
    val sales: LiveData<UiState<List<SaleSummary>>> = _sales

    // Small, visible "a database/network op is running" flag for the UI.
    private val _isSyncing = MutableLiveData(false)
    val isSyncing: LiveData<Boolean> = _isSyncing

    fun loadSales() {
        _sales.value = UiState.Loading
        _isSyncing.value = true
        viewModelScope.launch {
            try {
                val list = api.getSalesHistory()

                // Cache for offline
                salesDao?.deleteAllSales()
                salesDao?.insertSales(list.map { it.toEntity() })

                _sales.value = UiState.Success(list)
            } catch (e: Exception) {
                val localSales = salesDao?.getAllSales()?.map { it.toSummary() } ?: emptyList()
                if (localSales.isNotEmpty()) {
                    _sales.value = UiState.Success(localSales)
                } else {
                    _sales.value = UiState.Error(e.message ?: "Unknown error")
                }
            } finally {
                _isSyncing.value = false
            }
        }
    }
}
