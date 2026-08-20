import XCTest
@testable import GwinnPOS

final class PosConfigResponseTests: XCTestCase {

    // The app resolves the Stripe Terminal Location from GET /api/pos/config, so
    // decoding this payload correctly is what drives the Tap to Pay flow vs. the
    // "card payments not set up yet" screen.

    func testDecodesConfiguredLocationId() throws {
        let json = Data(#"{"locationId":"tml_test_123"}"#.utf8)
        let config = try JSONDecoder().decode(PosConfigResponse.self, from: json)
        XCTAssertEqual(config.locationId, "tml_test_123")
    }

    func testDecodesEmptyLocationId() throws {
        let json = Data(#"{"locationId":""}"#.utf8)
        let config = try JSONDecoder().decode(PosConfigResponse.self, from: json)
        XCTAssertEqual(config.locationId, "")
    }

    func testDefaultInitLocationIdIsEmpty() {
        XCTAssertEqual(PosConfigResponse().locationId, "")
    }

    // Store identity (multi-tenant): served by newer gwinn backends; the app
    // must decode it when present and tolerate older servers that omit it.

    func testDecodesStoreIdentity() throws {
        let json = Data("""
        {"locationId":"tml_1","tenantSlug":"aurora","twintQrUrl":null,
         "storeName":"Aurora Atelier","logoUrl":"https://cdn.example/logo.png",
         "currency":"eur"}
        """.utf8)
        let config = try JSONDecoder().decode(PosConfigResponse.self, from: json)
        XCTAssertEqual(config.tenantSlug, "aurora")
        XCTAssertEqual(config.storeName, "Aurora Atelier")
        XCTAssertEqual(config.logoUrl, "https://cdn.example/logo.png")
        XCTAssertEqual(config.currency, "eur")
    }

    func testDecodesNullLogoAsNil() throws {
        let json = Data(#"{"locationId":"","storeName":"Shop","logoUrl":null,"currency":"chf"}"#.utf8)
        let config = try JSONDecoder().decode(PosConfigResponse.self, from: json)
        XCTAssertEqual(config.storeName, "Shop")
        XCTAssertNil(config.logoUrl)
    }

    func testToleratesLegacyServerWithoutIdentityFields() throws {
        let json = Data(#"{"locationId":"tml_test_123"}"#.utf8)
        let config = try JSONDecoder().decode(PosConfigResponse.self, from: json)
        XCTAssertEqual(config.locationId, "tml_test_123")
        XCTAssertNil(config.storeName)
        XCTAssertNil(config.logoUrl)
        XCTAssertNil(config.currency)
    }

    func testToleratesMissingLocationId() throws {
        // A hypothetical minimal response must not crash the POS.
        let json = Data(#"{"storeName":"Shop"}"#.utf8)
        let config = try JSONDecoder().decode(PosConfigResponse.self, from: json)
        XCTAssertEqual(config.locationId, "")
    }
}
