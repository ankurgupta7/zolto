package ch.gwinn.pos.data

import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object RetrofitClient {

    private var _apiService: ApiService? = null
    private var _baseUrl: String? = null

    fun init(baseUrl: String, apiKey: String) {
        _baseUrl = baseUrl.trimEnd('/')

        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        }

        val httpClient = OkHttpClient.Builder()
            .addInterceptor { chain ->
                val request = chain.request().newBuilder()
                    .addHeader("X-POS-Key", apiKey)
                    .build()
                chain.proceed(request)
            }
            .addInterceptor(logging)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()

        val retrofit = Retrofit.Builder()
            .baseUrl(_baseUrl + '/')
            .client(httpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()

        _apiService = retrofit.create(ApiService::class.java)
    }

    /**
     * A throwaway client for redeeming a pairing token, before this device has
     * any credentials.
     *
     * Deliberately does NOT touch `_apiService` / `_baseUrl`: pairing can fail
     * (an expired or already-spent link), and a failed attempt must not leave the
     * app pointed at a half-configured store. It also omits the X-POS-Key
     * interceptor rather than sending an empty header.
     */
    fun pairingService(baseUrl: String): ApiService {
        val base = baseUrl.trim().trimEnd('/')
        val httpClient = OkHttpClient.Builder()
            // Body logging is deliberately off here: the response carries the
            // store's POS key, and logcat is readable by anyone with adb.
            .addInterceptor(
                HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC }
            )
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()

        return Retrofit.Builder()
            .baseUrl("$base/")
            .client(httpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ApiService::class.java)
    }

    val apiService: ApiService
        get() = _apiService ?: error("RetrofitClient not initialised — call init() first")

    /** Returns the configured base URL (without trailing slash). */
    fun getBaseUrl(): String = _baseUrl ?: error("RetrofitClient not initialised — call init() first")
}
