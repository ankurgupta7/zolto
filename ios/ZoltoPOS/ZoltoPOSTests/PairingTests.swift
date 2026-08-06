import XCTest
@testable import ZoltoPOS

/// Pairing is the gate between a fresh install and a working register, so the
/// URL/key/QR parsing rules are pinned down precisely.
final class PairingTests: XCTestCase {

    // MARK: - Server URL normalisation

    func testDefaultsSchemeToHttps() {
        XCTAssertEqual(Pairing.normalizeBaseURL("zolto.ch"), "https://zolto.ch")
    }

    func testKeepsExplicitScheme() {
        XCTAssertEqual(Pairing.normalizeBaseURL("http://localhost:3000"), "http://localhost:3000")
        XCTAssertEqual(Pairing.normalizeBaseURL("https://my-shop.example"), "https://my-shop.example")
    }

    func testStripsTrailingSlashesAndWhitespace() {
        XCTAssertEqual(Pairing.normalizeBaseURL("  https://zolto.ch//  "), "https://zolto.ch")
    }

    func testRejectsEmptyAndInvalidURLs() {
        XCTAssertNil(Pairing.normalizeBaseURL(""))
        XCTAssertNil(Pairing.normalizeBaseURL("   "))
        XCTAssertNil(Pairing.normalizeBaseURL("ftp://zolto.ch"))
        XCTAssertNil(Pairing.normalizeBaseURL("https://"))
    }

    func testKeepsSubdomainsAndPorts() {
        XCTAssertEqual(
            Pairing.normalizeBaseURL("aurora.zolto.ch:8443"),
            "https://aurora.zolto.ch:8443"
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
        let creds = Pairing.parseQrPayload("zolto://pair?key=abc123&url=my-shop.example")
        XCTAssertEqual(creds?.apiKey, "abc123")
        XCTAssertEqual(creds?.baseURL, "https://my-shop.example")
    }

    func testParsesHttpsUrlPayloadWithPosKeyParam() {
        let creds = Pairing.parseQrPayload("https://zolto.ch/admin/account/keys?posKey=deadbeef")
        XCTAssertEqual(creds?.apiKey, "deadbeef")
        XCTAssertNil(creds?.baseURL)
    }

    func testRejectsPlainUrlWithoutKey() {
        XCTAssertNil(Pairing.parseQrPayload("https://zolto.ch/some/page"))
    }

    func testParsesJsonPayload() {
        let creds = Pairing.parseQrPayload(#"{"posKey":"abc123","baseUrl":"https://aurora.zolto.ch"}"#)
        XCTAssertEqual(creds?.apiKey, "abc123")
        XCTAssertEqual(creds?.baseURL, "https://aurora.zolto.ch")
    }

    /// The canonical payload the admin's "scan to pair" QR encodes — built by
    /// `buildPosPairingPayload` in this repo's client/src/lib/posPairing.ts,
    /// whose own tests pin the same shape from the other side. Versioned JSON
    /// with zoltoPos/baseUrl/key. If this drifts, pairing-by-QR breaks.
    func testParsesCanonicalZoltoPairingPayload() {
        let creds = Pairing.parseQrPayload(
            #"{"zoltoPos":1,"baseUrl":"https://zolto.ch","key":"pos_abc123"}"#
        )
        XCTAssertEqual(creds?.apiKey, "pos_abc123")
        XCTAssertEqual(creds?.baseURL, "https://zolto.ch")
    }

    func testParsesJsonPayloadWithShortNames() {
        let creds = Pairing.parseQrPayload(#"{"key":"abc123"}"#)
        XCTAssertEqual(creds, Pairing.Credentials(apiKey: "abc123", baseURL: nil))
    }

    func testRejectsJsonWithoutKey() {
        XCTAssertNil(Pairing.parseQrPayload(#"{"baseUrl":"https://zolto.ch"}"#))
    }

    func testRejectsEmptyPayload() {
        XCTAssertNil(Pairing.parseQrPayload(""))
        XCTAssertNil(Pairing.parseQrPayload("  \n "))
    }
}
