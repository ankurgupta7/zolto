package ch.gwinn.pos.logic

/**
 * One-tap pairing links: `gwinn://pair?t=<token>&url=https://their-store.gwinn.ch`
 *
 * The merchant taps this in their store admin and the register binds itself,
 * instead of someone typing 64 hex characters into a phone at a market stall.
 *
 * The token is NOT a POS key — it is single-use, expires in minutes, and is
 * exchanged for the real key at POST /api/pos/pair. That indirection exists so
 * the key never travels in a URL, where it would land in browser history, access
 * logs and Referer headers.
 *
 * Lives in the pure-JVM `logic` module deliberately: parsing a hostile string is
 * exactly what wants unit tests that run without an emulator, and it keeps this
 * in step with the iOS counterpart (ios/GwinnPOS/GwinnPOS/Logic/Pairing.swift),
 * which the two test suites pin against the same link forms.
 */
object PairingLink {

    /** Fallback when a link carries no server of its own. */
    const val DEFAULT_BASE_URL = "https://gwinn.ch"

    const val SCHEME = "gwinn"
    private const val ACTION = "pair"

    data class Parsed(
        /** Redeemable once at POST /api/pos/pair. Not a POS key. */
        val token: String,
        /** Where to redeem it. A fresh install knows no host, so links carry one. */
        val baseUrl: String,
    )

    /**
     * Normalises a server origin: trims, defaults the scheme to https, drops
     * trailing slashes. Returns null for anything that can't be a usable http(s)
     * origin — so a link carrying `ftp://…` falls back to the default rather
     * than pointing the register somewhere it can't talk to.
     */
    fun normalizeBaseUrl(input: String?): String? {
        var s = (input ?: return null).trim()
        if (s.isEmpty()) return null
        if (!s.contains("://")) s = "https://$s"
        val match = Regex("^(https?)://([^/?#\\s]+)", RegexOption.IGNORE_CASE).find(s)
            ?: return null
        val scheme = match.groupValues[1].lowercase()
        val host = match.groupValues[2]
        if (host.isEmpty()) return null
        // Keep only scheme + authority: a pairing link has no business setting a
        // path, and Retrofit gets a clean base URL.
        return "$scheme://$host"
    }

    /**
     * A plausible pairing token: non-empty and whitespace-free. Deliberately
     * lenient about the alphabet so a change to the server's token format never
     * requires an app update — the server is what decides validity.
     */
    fun normalizeToken(input: String?): String? {
        val s = (input ?: return null).trim()
        if (s.isEmpty()) return null
        if (s.any { it.isWhitespace() }) return null
        return s
    }

    /**
     * Parses a tapped deep link, or returns null if this isn't one.
     *
     * Hand-rolled rather than using android.net.Uri so it stays in the pure-JVM
     * module and testable off-device. Only the shapes the platform actually
     * delivers matter: `gwinn://pair?…` (action in the authority) and
     * `gwinn:/pair?…` (action in the path).
     */
    fun parse(link: String?): Parsed? {
        val raw = (link ?: return null).trim()
        if (raw.isEmpty()) return null

        val schemeSplit = raw.indexOf(':')
        if (schemeSplit <= 0) return null
        if (!raw.substring(0, schemeSplit).equals(SCHEME, ignoreCase = true)) return null

        // Everything after "gwinn:", with any leading slashes removed, is
        // "<action>[?query]" regardless of whether the link used // or /.
        val rest = raw.substring(schemeSplit + 1).trimStart('/')
        val queryStart = rest.indexOf('?')
        val action = if (queryStart >= 0) rest.substring(0, queryStart) else rest
        if (!action.trim('/').equals(ACTION, ignoreCase = true)) return null
        if (queryStart < 0) return null

        val params = parseQuery(rest.substring(queryStart + 1))
        val token = normalizeToken(firstOf(params, "t", "token")) ?: return null
        val baseUrl = normalizeBaseUrl(firstOf(params, "url", "server", "baseurl", "base_url"))
            ?: DEFAULT_BASE_URL
        return Parsed(token = token, baseUrl = baseUrl)
    }

    /** Is this a link we should handle at all? Cheap check for an intent filter. */
    fun isPairingLink(link: String?): Boolean = parse(link) != null

    private fun firstOf(params: Map<String, String>, vararg names: String): String? {
        for (name in names) params[name]?.let { return it }
        return null
    }

    private fun parseQuery(query: String): Map<String, String> {
        val out = LinkedHashMap<String, String>()
        for (pair in query.split('&')) {
            if (pair.isEmpty()) continue
            val eq = pair.indexOf('=')
            // A valueless flag (`?t`) carries nothing to redeem, so skip it
            // rather than storing an empty token.
            if (eq <= 0) continue
            val key = percentDecode(pair.substring(0, eq)).lowercase()
            val value = percentDecode(pair.substring(eq + 1))
            // First occurrence wins: a duplicated `t=` must not let a second
            // value silently override the one the merchant's admin minted.
            if (!out.containsKey(key)) out[key] = value
        }
        return out
    }

    private fun percentDecode(s: String): String {
        if (!s.contains('%') && !s.contains('+')) return s
        val bytes = java.io.ByteArrayOutputStream(s.length)
        var i = 0
        while (i < s.length) {
            val c = s[i]
            when {
                c == '%' && i + 2 < s.length -> {
                    val hex = s.substring(i + 1, i + 3)
                    val byte = hex.toIntOrNull(16)
                    if (byte == null) {
                        bytes.write(c.code)
                        i++
                    } else {
                        bytes.write(byte)
                        i += 3
                    }
                }
                // A literal '+' means space in a query string.
                c == '+' -> { bytes.write(' '.code); i++ }
                else -> {
                    // Write the character's UTF-8 bytes so multi-byte input
                    // survives the round trip.
                    bytes.write(c.toString().toByteArray(Charsets.UTF_8))
                    i++
                }
            }
        }
        return bytes.toString("UTF-8")
    }
}
