import XCTest
@testable import GwinnPOS

/// Pairing is the gate between a fresh install and a working register, so the
/// URL/key/QR parsing rules are pinned down precisely.
final class PairingTests: XCTestCase {

    // MARK: - Server URL normalisation

    func testDefaultsSchemeToHttps() {
        XCTAssertEqual(Pairing.normalizeBaseURL("gwinn.ch"), "https://gwinn.ch")
    }

    func testKeepsExplicitScheme() {
        XCTAssertEqual(Pairing.normalizeBaseURL("http://localhost:3000"), "http://localhost:3000")
        XCTAssertEqual(Pairing.normalizeBaseURL("https://my-shop.example"), "https://my-shop.example")
    }

    func testStripsTrailingSlashesAndWhitespace() {
        XCTAssertEqual(Pairing.normalizeBaseURL("  https://gwinn.ch//  "), "https://gwinn.ch")
    }

    func testRejectsEmptyAndInvalidURLs() {
        XCTAssertNil(Pairing.normalizeBaseURL(""))
        XCTAssertNil(Pairing.normalizeBaseURL("   "))
        XCTAssertNil(Pairing.normalizeBaseURL("ftp://gwinn.ch"))
        XCTAssertNil(Pairing.normalizeBaseURL("https://"))
    }

    func testKeepsSubdomainsAndPorts() {
        XCTAssertEqual(
            Pairing.normalizeBaseURL("aurora.gwinn.ch:8443"),
            "https://aurora.gwinn.ch:8443"
        )
    }

    // MARK: - Key normalisation

    func testAcceptsTrimmedKey() {
        XCTAssertEqual(Pairing.normalizeKey("  abc123  "), "abc123")
    }

    func testRejectsEmptyOrMultiTokenKeys() {
        XCTAssertNil(Pairing.normalizeKey(""))
        XCTAssertNil(Pairing.normalizeKey("   "))
        XCTAssertNil(Pairing.normalizeKey("two words"))
    }

    // MARK: - QR payloads

    func testParsesBareKeyPayload() {
        let hexKey = String(repeating: "ab12", count: 16)
        let creds = Pairing.parseQrPayload(hexKey)
        XCTAssertEqual(creds, Pairing.Credentials(apiKey: hexKey, baseURL: nil))
    }

    func testParsesUrlPayloadWithKeyAndServer() {
        let creds = Pairing.parseQrPayload("gwinn://pair?key=abc123&url=my-shop.example")
        XCTAssertEqual(creds?.apiKey, "abc123")
        XCTAssertEqual(creds?.baseURL, "https://my-shop.example")
    }

    func testParsesHttpsUrlPayloadWithPosKeyParam() {
        let creds = Pairing.parseQrPayload("https://gwinn.ch/admin/account/keys?posKey=deadbeef")
        XCTAssertEqual(creds?.apiKey, "deadbeef")
        XCTAssertNil(creds?.baseURL)
    }

    func testRejectsPlainUrlWithoutKey() {
        XCTAssertNil(Pairing.parseQrPayload("https://gwinn.ch/some/page"))
    }

    func testParsesJsonPayload() {
        let creds = Pairing.parseQrPayload(#"{"posKey":"abc123","baseUrl":"https://aurora.gwinn.ch"}"#)
        XCTAssertEqual(creds?.apiKey, "abc123")
        XCTAssertEqual(creds?.baseURL, "https://aurora.gwinn.ch")
    }

    /// The canonical payload the admin's "scan to pair" QR encodes — built by
    /// `buildPosPairingPayload` in this repo's client/src/lib/posPairing.ts,
    /// whose own tests pin the same shape from the other side. Versioned JSON
    /// with platformPos/baseUrl/key. If this drifts, pairing-by-QR breaks.
    func testParsesCanonicalGwinnPairingPayload() {
        let creds = Pairing.parseQrPayload(
            #"{"platformPos":1,"baseUrl":"https://gwinn.ch","key":"pos_abc123"}"#
        )
        XCTAssertEqual(creds?.apiKey, "pos_abc123")
        XCTAssertEqual(creds?.baseURL, "https://gwinn.ch")
    }

    func testParsesJsonPayloadWithShortNames() {
        let creds = Pairing.parseQrPayload(#"{"key":"abc123"}"#)
        XCTAssertEqual(creds, Pairing.Credentials(apiKey: "abc123", baseURL: nil))
    }

    func testRejectsJsonWithoutKey() {
        XCTAssertNil(Pairing.parseQrPayload(#"{"baseUrl":"https://gwinn.ch"}"#))
    }

    func testRejectsEmptyPayload() {
        XCTAssertNil(Pairing.parseQrPayload(""))
        XCTAssertNil(Pairing.parseQrPayload("  \n "))
    }

    // MARK: - One-tap pairing deep links
    //
    // `gwinn://pair?t=<token>&url=<origin>` is what the merchant taps in their
    // admin. The token is NOT a POS key — it is redeemed once at
    // POST /api/pos/pair — so these tests also pin that a pairing link and a
    // key-carrying QR payload can never be mistaken for one another.

    func testParsesPairingLink() {
        let link = Pairing.parsePairingLink(
            URL(string: "gwinn://pair?t=tok123&url=https://bergblume.gwinn.ch")!
        )
        XCTAssertEqual(
            link,
            Pairing.PairingLink(token: "tok123", baseURL: "https://bergblume.gwinn.ch")
        )
    }

    func testAcceptsTokenSpelledOut() {
        let link = Pairing.parsePairingLink(URL(string: "gwinn://pair?token=tok123")!)
        XCTAssertEqual(link?.token, "tok123")
    }

    func testFallsBackToDefaultHostWhenLinkCarriesNone() {
        // Every link the admin mints carries `url`, but a hand-typed one may not,
        // and landing on the default beats refusing to pair at all.
        let link = Pairing.parsePairingLink(URL(string: "gwinn://pair?t=tok123")!)
        XCTAssertEqual(link?.baseURL, Pairing.defaultBaseURL)
    }

    func testIgnoresAnUnusableHostInTheLink() {
        let link = Pairing.parsePairingLink(
            URL(string: "gwinn://pair?t=tok123&url=ftp://evil.example")!
        )
        XCTAssertEqual(link?.baseURL, Pairing.defaultBaseURL)
    }

    func testPercentDecodesTheServerOrigin() {
        let link = Pairing.parsePairingLink(
            URL(string: "gwinn://pair?t=tok&url=https%3A%2F%2Fbergblume.gwinn.ch")!
        )
        XCTAssertEqual(link?.baseURL, "https://bergblume.gwinn.ch")
    }

    func testRejectsOtherSchemesAndActions() {
        XCTAssertNil(Pairing.parsePairingLink(URL(string: "https://gwinn.ch/pos/pair?t=tok")!))
        XCTAssertNil(Pairing.parsePairingLink(URL(string: "gwinn://open?t=tok")!))
        XCTAssertNil(Pairing.parsePairingLink(URL(string: "otherapp://pair?t=tok")!))
    }

    func testRejectsPairingLinkWithoutAToken() {
        XCTAssertNil(Pairing.parsePairingLink(URL(string: "gwinn://pair")!))
        XCTAssertNil(Pairing.parsePairingLink(URL(string: "gwinn://pair?t=")!))
        XCTAssertNil(Pairing.parsePairingLink(URL(string: "gwinn://pair?url=https://gwinn.ch")!))
    }

    func testAcceptsSingleSlashForm() {
        // Depending on how the link is written, "pair" arrives as the host or as
        // the path. Both must work rather than failing on a form the OS hands us.
        XCTAssertEqual(Pairing.parsePairingLink(URL(string: "gwinn:/pair?t=tok")!)?.token, "tok")
    }

    func testPairingLinkAndKeyQrAreNotInterchangeable() {
        // A key-carrying QR URL must not parse as a redeemable token...
        XCTAssertNil(
            Pairing.parsePairingLink(URL(string: "gwinn://pair?key=deadbeef")!)
        )
        // ...and a token link must not be read as though it carried a POS key.
        let creds = Pairing.parseQrPayload("gwinn://pair?t=tok123")
        XCTAssertNil(creds)
    }
}
