package ch.zolto.pos.logic

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
 * These cases mirror ios/ZoltoPOS/ZoltoPOSTests/PairingTests.swift so the two
 * platforms can't drift on what a link means.
 */
class PairingLinkTest {

    @Test
    fun `parses a minted link`() {
        val parsed = PairingLink.parse("zolto://pair?t=tok123&url=https://bergblume.zolto.ch")
        assertEquals(
            PairingLink.Parsed(token = "tok123", baseUrl = "https://bergblume.zolto.ch"),
            parsed,
        )
    }

    @Test
    fun `accepts token spelled out`() {
        assertEquals("tok123", PairingLink.parse("zolto://pair?token=tok123")?.token)
    }

    @Test
    fun `percent-decodes the server origin`() {
        val parsed = PairingLink.parse("zolto://pair?t=tok&url=https%3A%2F%2Fbergblume.zolto.ch")
        assertEquals("https://bergblume.zolto.ch", parsed?.baseUrl)
    }

    @Test
    fun `falls back to the default host when a link carries none`() {
        // Every link the admin mints carries `url`, but landing on the default
        // beats refusing to pair at all.
        assertEquals(
            PairingLink.DEFAULT_BASE_URL,
            PairingLink.parse("zolto://pair?t=tok123")?.baseUrl,
        )
    }

    @Test
    fun `ignores an unusable host in the link`() {
        // A scheme the register can't talk to must not become its base URL.
        assertEquals(
            PairingLink.DEFAULT_BASE_URL,
            PairingLink.parse("zolto://pair?t=tok&url=ftp://evil.example")?.baseUrl,
        )
    }

    @Test
    fun `keeps only scheme and authority from the origin`() {
        // A pairing link has no business setting a path on the API base URL.
        assertEquals(
            "https://bergblume.zolto.ch",
            PairingLink.parse("zolto://pair?t=tok&url=https://bergblume.zolto.ch/admin/keys")?.baseUrl,
        )
    }

    @Test
    fun `keeps ports and subdomains`() {
        assertEquals(
            "https://aurora.zolto.ch:8443",
            PairingLink.parse("zolto://pair?t=tok&url=aurora.zolto.ch:8443")?.baseUrl,
        )
    }

    @Test
    fun `accepts the single-slash form`() {
        // Depending on how the link is written, the action arrives as the
        // authority or as the path. Both must work.
        assertEquals("tok", PairingLink.parse("zolto:/pair?t=tok")?.token)
        assertEquals("tok", PairingLink.parse("zolto://pair?t=tok")?.token)
    }

    @Test
    fun `rejects other schemes and other actions`() {
        assertNull(PairingLink.parse("https://zolto.ch/pos/pair?t=tok"))
        assertNull(PairingLink.parse("otherapp://pair?t=tok"))
        assertNull(PairingLink.parse("zolto://open?t=tok"))
        assertNull(PairingLink.parse("zolto://pairing?t=tok"))
    }

    @Test
    fun `rejects a link with no token`() {
        assertNull(PairingLink.parse("zolto://pair"))
        assertNull(PairingLink.parse("zolto://pair?t="))
        assertNull(PairingLink.parse("zolto://pair?t"))
        assertNull(PairingLink.parse("zolto://pair?url=https://zolto.ch"))
    }

    @Test
    fun `rejects empty and malformed input`() {
        assertNull(PairingLink.parse(null))
        assertNull(PairingLink.parse(""))
        assertNull(PairingLink.parse("   "))
        assertNull(PairingLink.parse("zolto"))
        assertNull(PairingLink.parse("://pair?t=tok"))
    }

    @Test
    fun `first token wins when a link repeats the parameter`() {
        // A tacked-on second `t=` must not override what the admin minted.
        assertEquals("real", PairingLink.parse("zolto://pair?t=real&t=injected")?.token)
    }

    @Test
    fun `rejects a token containing whitespace`() {
        assertNull(PairingLink.normalizeToken("tok 123"))
        assertNull(PairingLink.normalizeToken("tok\n123"))
        assertNull(PairingLink.parse("zolto://pair?t=tok%20123"))
    }

    @Test
    fun `trims a token`() {
        assertEquals("tok", PairingLink.normalizeToken("  tok  "))
    }

    @Test
    fun `isPairingLink recognises only real pairing links`() {
        assertTrue(PairingLink.isPairingLink("zolto://pair?t=tok"))
        assertFalse(PairingLink.isPairingLink("zolto://pair"))
        assertFalse(PairingLink.isPairingLink("https://zolto.ch"))
        assertFalse(PairingLink.isPairingLink(null))
    }

    @Test
    fun `is case-insensitive about the scheme and action`() {
        assertEquals("tok", PairingLink.parse("ZOLTO://PAIR?t=tok")?.token)
        assertEquals("tok", PairingLink.parse("zolto://pair?T=tok")?.token)
    }

    @Test
    fun `normalizeBaseUrl defaults the scheme to https`() {
        assertEquals("https://zolto.ch", PairingLink.normalizeBaseUrl("zolto.ch"))
        assertEquals("https://zolto.ch", PairingLink.normalizeBaseUrl("  https://zolto.ch//  "))
        assertEquals("http://localhost:3000", PairingLink.normalizeBaseUrl("http://localhost:3000"))
        assertNull(PairingLink.normalizeBaseUrl(""))
        assertNull(PairingLink.normalizeBaseUrl("https://"))
    }

    @Test
    fun `a key-carrying link is not a redeemable token`() {
        // The QR pairing payload embeds the POS key itself; a pairing link must
        // never be read as though `key=` were a token, or the two credential
        // kinds get confused.
        assertNull(PairingLink.parse("zolto://pair?key=deadbeef"))
    }
}
