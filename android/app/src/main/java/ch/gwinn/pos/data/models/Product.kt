package ch.gwinn.pos.data.models

import com.google.gson.annotations.SerializedName

data class Product(
    val id: Int,
    val name: String,
    @SerializedName("nameEn") val nameEn: String?,
    val price: String?,
    @SerializedName("priceRappen") val priceRappen: Int,
    val category: String?,
    @SerializedName("imageUrl") val imageUrl: String?,
    @SerializedName("imageKey") val imageKey: String?,
    val quantity: Int,
    val description: String? = null,
    @SerializedName("descriptionEn") val descriptionEn: String? = null,
    // Defaults to true: the default (non-hidden-included) catalogue fetch
    // only ever returns visible products anyway, so old call sites that
    // don't know about this field stay correct.
    val visible: Boolean = true,
) {
    val priceChf: String get() = "%.2f".format(priceRappen / 100.0)
    val displayName: String get() = nameEn?.takeIf { it.isNotBlank() } ?: name

    /**
     * Everything the unified search box matches against — name (both languages),
     * category, description (both languages) and the formatted price. Precomputed
     * so filtering a large catalog per keystroke stays cheap.
     */
    val searchableText: String
        get() = listOfNotNull(name, nameEn, category, description, descriptionEn, priceChf)
            .joinToString(" ")
}
