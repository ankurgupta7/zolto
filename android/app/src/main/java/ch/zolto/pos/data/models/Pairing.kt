package ch.zolto.pos.data.models

import com.google.gson.annotations.SerializedName

/**
 * Wire types for `POST /api/pos/pair` — one-tap register pairing.
 *
 * The token comes from a link the merchant tapped in their store admin
 * (`zolto://pair?t=…`, parsed by ch.zolto.pos.logic.PairingLink). It is
 * single-use and expires in minutes; redeeming it returns the store's real POS
 * key, which goes straight into PosConfig and is never logged or shown.
 *
 * This is the only POS call that carries no X-POS-Key, because it is how a
 * register with no key gets one.
 */
data class PairingRequest(
    @SerializedName("token") val token: String,
)

data class PairingResponse(
    @SerializedName("apiKey") val apiKey: String,
    @SerializedName("storeName") val storeName: String? = null,
    @SerializedName("storeSlug") val storeSlug: String? = null,
)
