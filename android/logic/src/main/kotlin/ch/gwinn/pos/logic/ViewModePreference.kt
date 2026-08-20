package ch.gwinn.pos.logic

/**
 * Which layout the product picker opens in, and how a cashier's choice
 * survives a restart.
 *
 * The list is the default: it is the only shape in which a full product name
 * fits on screen, and the name is what a cashier reads to tell two similar
 * pieces apart. The grid stays available for merchants who recognise stock by
 * its photograph — the choice is per-device and sticky, because a cashier who
 * re-picks a layout every morning is being asked the same question twice.
 *
 * Kept as plain strings (rather than the ViewModel's enum) so the
 * default-and-fallback rule can be unit-tested without an Android runtime;
 * the values match `ProductViewModel.ViewMode`'s constant names.
 */
object ViewModePreference {
    const val STORAGE_KEY = "pos.productViewMode"

    const val GRID = "GRID"
    const val LIST = "LIST"

    /** What a fresh install opens in. */
    const val DEFAULT = LIST

    /**
     * Maps a stored value onto a layout, falling back to the default for a
     * first run, a blank, or anything written by an older build.
     */
    fun resolve(stored: String?): String = when (stored?.trim()?.uppercase()) {
        GRID -> GRID
        LIST -> LIST
        else -> DEFAULT
    }
}
