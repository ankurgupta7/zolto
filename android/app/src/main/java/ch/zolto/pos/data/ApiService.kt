package ch.zolto.pos.data

import ch.zolto.pos.data.models.*
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

interface ApiService {

    // includeHidden lets the cashier's "Show Hidden Items" toggle (PosSession)
    // opt into seeing products an admin has hidden from the default storefront
    // view. Off by default so ordinary catalogue loads are unaffected.
    @GET("api/pos/health")
    suspend fun health(): HealthResponse

    @GET("api/pos/products")
    suspend fun getProducts(@Query("includeHidden") includeHidden: Boolean = false): List<Product>

    @GET("api/pos/categories")
    suspend fun getCategories(): CategoriesResponse

    @GET("api/pos/config")
    suspend fun getConfig(): PosConfigResponse

    // Tap to Pay: minted on the tenant's own connected Stripe account (zolto).
    @POST("api/pos/terminal/connection-token")
    suspend fun getConnectionToken(): ConnectionTokenResponse

    // First-time Tap to Pay setup: creates the tenant's Terminal Location on
    // their connected account; afterwards /api/pos/config returns its id.
    @POST("api/pos/terminal/location")
    suspend fun provisionLocation(@Body request: LocationProvisionRequest): LocationProvisionResponse

    @POST("api/pos/payment-intent")
    suspend fun createPaymentIntent(@Body request: PaymentIntentRequest): PaymentIntentResponse

    @POST("api/pos/sale")
    suspend fun confirmSale(@Body request: SaleRequest): SaleResponse

    @POST("api/pos/manual-sale")
    suspend fun manualSale(@Body request: ManualSaleRequest): ManualSaleResponse

    @POST("api/pos/twint-intent")
    suspend fun twintIntent(@Body request: TwintIntentRequest): TwintIntentResponse

    @GET("api/pos/sales")
    suspend fun getSalesHistory(): List<SaleSummary>

    @POST("api/pos/send-receipt")
    suspend fun sendReceipt(@Body request: SendReceiptRequest): SendReceiptResponse

    @POST("api/pos/save-receipt")
    suspend fun saveReceipt(@Body request: SaveReceiptRequest): SaveReceiptResponse
}
