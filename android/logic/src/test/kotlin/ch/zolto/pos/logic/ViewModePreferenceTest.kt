package ch.zolto.pos.logic

import kotlin.test.*

class ViewModePreferenceTest {

    // The whole point of the change: a fresh install opens in the list, where
    // a full product name fits, not the grid, where it is clipped.
    @Test
    fun `first run defaults to the list`() {
        assertEquals(ViewModePreference.LIST, ViewModePreference.resolve(null))
        assertEquals(ViewModePreference.LIST, ViewModePreference.DEFAULT)
    }

    @Test
    fun `blank stored value falls back to the default`() {
        assertEquals(ViewModePreference.LIST, ViewModePreference.resolve(""))
        assertEquals(ViewModePreference.LIST, ViewModePreference.resolve("   "))
    }

    @Test
    fun `a stored choice is honoured`() {
        assertEquals(ViewModePreference.GRID, ViewModePreference.resolve("GRID"))
        assertEquals(ViewModePreference.LIST, ViewModePreference.resolve("LIST"))
    }

    @Test
    fun `a stored value is case insensitive`() {
        assertEquals(ViewModePreference.GRID, ViewModePreference.resolve("grid"))
        assertEquals(ViewModePreference.LIST, ViewModePreference.resolve("List"))
    }

    // A value left behind by an older build must not strand the picker in an
    // unrenderable state.
    @Test
    fun `an unknown stored value falls back to the default`() {
        assertEquals(ViewModePreference.LIST, ViewModePreference.resolve("CAROUSEL"))
    }

    // resolve() has to accept exactly what setViewMode writes back, or the
    // choice silently resets on the next launch.
    @Test
    fun `resolved values round trip`() {
        for (mode in listOf(ViewModePreference.GRID, ViewModePreference.LIST)) {
            assertEquals(mode, ViewModePreference.resolve(mode))
        }
    }
}
