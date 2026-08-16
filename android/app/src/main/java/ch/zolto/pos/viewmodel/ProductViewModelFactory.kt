package ch.zolto.pos.viewmodel

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import ch.zolto.pos.data.ApiService
import ch.zolto.pos.data.OfflinePaymentManager
import ch.zolto.pos.data.SharedPrefsViewModeStore
import ch.zolto.pos.data.ViewModeStore

class ProductViewModelFactory(
    private val api: ApiService,
    private val productDao: ch.zolto.pos.data.local.ProductDao,
    private val context: Context? = null,
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        @Suppress("UNCHECKED_CAST")
        val offlineManager = context?.let { OfflinePaymentManager(it) }
        val viewModeStore = context?.let { SharedPrefsViewModeStore(it) } ?: ViewModeStore.None
        return ProductViewModel(api, productDao, offlineManager, viewModeStore) as T
    }
}

class PaymentViewModelFactory(
    private val api: ApiService,
    private val context: Context? = null,
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        @Suppress("UNCHECKED_CAST")
        val offlineManager = context?.let { OfflinePaymentManager(it) }
        return PaymentViewModel(api, offlineManager) as T
    }
}

class SalesHistoryViewModelFactory(
    private val api: ApiService,
    private val salesDao: ch.zolto.pos.data.local.SalesDao,
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        @Suppress("UNCHECKED_CAST")
        return SalesHistoryViewModel(api, salesDao) as T
    }
}
