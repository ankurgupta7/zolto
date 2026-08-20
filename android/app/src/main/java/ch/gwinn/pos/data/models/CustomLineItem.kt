package ch.gwinn.pos.data.models

import java.util.UUID

/**
 * A line item sold outside the catalogue (e.g. a one-off repair or a piece
 * not tracked in inventory). Carries no product id — the backend records it
 * by name instead.
 */
data class CustomLineItem(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val priceRappen: Int,
)
