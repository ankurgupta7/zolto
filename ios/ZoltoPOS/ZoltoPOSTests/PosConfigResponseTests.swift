import XCTest
@testable import ZoltoPOS

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
}
