package ch.zolto.pos.data.models

import com.google.gson.annotations.SerializedName

/**
 * Response of `GET /api/pos/categories` — the canonical category list and the
 * "extra includes" fold map, both sourced from the website's shared/const.ts so
 * the app never hard-codes category names.
 */
data class CategoriesResponse(
    val categories: List<String> = emptyList(),
    @SerializedName("extraIncludes") val extraIncludes: Map<String, List<String>> = emptyMap(),
)
