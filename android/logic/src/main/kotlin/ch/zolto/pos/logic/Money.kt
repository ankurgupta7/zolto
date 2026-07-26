package ch.zolto.pos.logic

/**
 * Shared CHF <-> Rappen conversion for cashier-entered amounts (bargained
 * price overrides, custom item prices) — the one place that decides what
 * counts as a valid amount typed into a text field.
 */
object Money {
    /**
     * Parses a cashier-entered CHF amount (accepting either `.` or `,` as the
     * decimal separator) into Rappen, rounding to the nearest Rappen. Returns
     * `null` for blank, non-numeric, or negative input.
     */
    fun parseChfToRappen(text: String): Int? {
        val normalized = text.trim().replace(",", ".")
        if (normalized.isEmpty()) return null
        val value = normalized.toDoubleOrNull() ?: return null
        if (value < 0) return null
        return Math.round(value * 100).toInt()
    }

    fun chfString(rappen: Int): String = "%.2f".format(rappen / 100.0)
}
