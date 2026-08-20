package ch.gwinn.pos.logic

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Pairing links are the gate between a fresh install and a working register, and
 * the input is a string a hostile party could craft, so the rules are pinned
 * precisely here.
 *
 * These cases mirror ios/GwinnPOS/GwinnPOSTests/PairingTests.swift so the two
 * platforms can't drift on what a link means.
 */
class PairingLinkTest {

    @Test
    fun `parses a minted link`() {
        val parsed = PairingLink.parse("gwinn://pair?t=tok123&url=https://bergblume.gwinn.ch")
        assertEquals(
            PairingLink.Parsed(token = "tok123", baseUrl = "https://bergblume.gwinn.ch"),
            parsed,
        )
    }

    @Test
    fun `accepts token spelled out`() {
        assertEquals("tok123", PairingLink.parse("gwinn://pair?token=tok123")?.token)
    }

    @Test
    fun `percent-decodes the server origin`() {
        val parsed = PairingLink.parse("gwinn://pair?t=tok&url=https%3A%2F%2Fbergblume.gwinn.ch")
        assertEquals("https://bergblume.gwinn.ch", parsed?.baseUrl)
    }

    @Test
    fun `falls back to the default host when a link carries none`() {
        // Every link the admin mints carries `url`, but landing on the default
        // beats refusing to pair at all.
        assertEquals(
            PairingLink.DEFAULT_BASE_URL,
            PairingLink.parse("gwinn://pair?t=tok123")?.baseUrl,
        )
    }

    @Test
    fun `ignores an unusable host in the link`() {
        // A scheme the register can't talk to must not become its base URL.
        assertEquals(
            PairingLink.DEFAULT_BASE_URL,
            PairingLink.parse("gwinn://pair?t=tok&url=ftp://evil.example")?.baseUrl,
        )
    }

    @Test
    fun `keeps only scheme and authority from the origin`() {
        // A pairing link has no business setting a path on the API base URL.
        assertEquals(
            "https://bergblume.gwinn.ch",
            PairingLink.parse("gwinn://pair?t=tok&url=https://bergblume.gwinn.ch/admin/keys")?.baseUrl,
        )
    }

    @Test
    fun `keeps ports and subdomains`() {
        assertEquals(
            "https://aurora.gwinn.ch:8443",
            PairingLink.parse("gwinn://pair?t=tok&url=aurora.gwinn.ch:8443")?.baseUrl,
        )
    }

    @Test
    fun `accepts the single-slash form`() {
        // Depending on how the link is written, the action arrives as the
        // authority or as the path. Both must work.
        assertEquals("tok", PairingLink.parse("gwinn:/pair?t=tok")?.token)
        assertEquals("tok", PairingLink.parse("gwinn://pair?t=tok")?.token)
    }

    @Test
    fun `rejects other schemes and other actions`() {
        assertNull(PairingLink.parse("https://gwinn.ch/pos/pair?t=tok"))
        assertNull(PairingLink.parse("otherapp://pair?t=tok"))
        assertNull(PairingLink.parse("gwinn://open?t=tok"))
        assertNull(PairingLink.parse("gwinn://pairing?t=tok"))
    }

    @Test
    fun `rejects a link with no token`() {
        assertNull(PairingLink.parse("gwinn://pair"))
        assertNull(PairingLink.parse("gwinn://pair?t="))
        assertNull(PairingLink.parse("gwinn://pair?t"))
        assertNull(PairingLink.parse("gwinn://pair?url=https://gwinn.ch"))
    }

    @Test
    fun `rejects empty and malformed input`() {
        assertNull(PairingLink.parse(null))
        assertNull(PairingLink.parse(""))
        assertNull(PairingLink.parse("   "))
        assertNull(PairingLink.parse("gwinn"))
        assertNull(PairingLink.parse("://pair?t=tok"))
    }

    @Test
    fun `first token wins when a link repeats the parameter`() {
        // A tacked-on second `t=` must not override what the admin minted.
        assertEquals("real", PairingLink.parse("gwinn://pair?t=real&t=injected")?.token)
    }

    @Test
    fun `rejects a token containing whitespace`() {
        assertNull(PairingLink.normalizeToken("tok 123"))
        assertNull(PairingLink.normalizeToken("tok\n123"))
        assertNull(PairingLink.parse("gwinn://pair?t=tok%20123"))
    }

    @Test
    fun `trims a token`() {
        assertEquals("tok", PairingLink.normalizeToken("  tok  "))
    }

    @Test
    fun `isPairingLink recognises only real pairing links`() {
        assertTrue(PairingLink.isPairingLink("gwinn://pair?t=tok"))
        assertFalse(PairingLink.isPairingLink("gwinn://pair"))
        assertFalse(PairingLink.isPairingLink("https://gwinn.ch"))
        assertFalse(PairingLink.isPairingLink(null))
    }

    @Test
    fun `is case-insensitive about the scheme and action`() {
        assertEquals("tok", PairingLink.parse("GWINN://PAIR?t=tok")?.token)
        assertEquals("tok", PairingLink.parse("gwinn://pair?T=tok")?.token)
    }

    @Test
    fun `normalizeBaseUrl defaults the scheme to https`() {
        assertEquals("https://gwinn.ch", PairingLink.normalizeBaseUrl("gwinn.ch"))
        assertEquals("https://gwinn.ch", PairingLink.normalizeBaseUrl("  https://gwinn.ch//  "))
        assertEquals("http://localhost:3000", PairingLink.normalizeBaseUrl("http://localhost:3000"))
        assertNull(PairingLink.normalizeBaseUrl(""))
        assertNull(PairingLink.normalizeBaseUrl("https://"))
    }

    @Test
    fun `a key-carrying link is not a redeemable token`() {
        // The QR pairing payload embeds the POS key itself; a pairing link must
        // never be read as though `key=` were a token, or the two credential
        // kinds get confused.
        assertNull(PairingLink.parse("gwinn://pair?key=deadbeef"))
    }
}
