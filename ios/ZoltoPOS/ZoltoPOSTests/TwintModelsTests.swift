import XCTest
@testable import ZoltoPOS

/// TWINT-specific contract tests — verifies that the JSON wire format for
/// POST /api/pos/twint-intent matches what server/pos.ts (this repo) expects.
final class TwintModelsTests: XCTestCase {

    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    func testTwintIntentRequestEncodesMinimalPayload() throws {
        let request = TwintIntentRequest(productIds: [1])
        let data = try encoder.encode(request)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]

        XCTAssertEqual(json?["productIds"] as? [Int], [1])
        XCTAssertEqual(json?["allowHidden"] as? Bool, false)
        XCTAssertNotNil(json?["priceOverrides"] as? [String: Int])
        XCTAssertNotNil(json?["customItems"] as? [[String: Any]])
    }

    func testTwintIntentRequestEncodesAllowHidden() throws {
        let request = TwintIntentRequest(
            productIds: [1],
            allowHidden: true
        )
        let data = try encoder.encode(request)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]

        XCTAssertEqual(json?["allowHidden"] as? Bool, true)
    }

    func testTwintIntentRequestEncodesPriceOverrides() throws {
        let request = TwintIntentRequest(
            productIds: [1],
            priceOverrides: ["1": 4000]
        )
        let data = try encoder.encode(request)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]

        XCTAssertEqual((json?["priceOverrides"] as? [String: Int])?["1"], 4000)
    }

    func testTwintIntentRequestEncodesCustomItems() throws {
        let request = TwintIntentRequest(
            productIds: [2],
            customItems: [CustomLineItemRequest(name: "Engraving", priceRappen: 800)]
        )
        let data = try encoder.encode(request)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]

        let items = json?["customItems"] as? [[String: Any]]
        XCTAssertEqual(items?.count, 1)
        XCTAssertEqual(items?.first?["name"] as? String, "Engraving")
        XCTAssertEqual(items?.first?["priceRappen"] as? Int, 800)
    }

    func testTwintIntentRequestRoundTrips() throws {
        let original = TwintIntentRequest(
            productIds: [1],
            allowHidden: true,
            priceOverrides: ["1": 3000],
            customItems: [CustomLineItemRequest(name: "Box", priceRappen: 200)]
        )
        let data = try encoder.encode(original)
        let decoded = try decoder.decode(TwintIntentRequest.self, from: data)

        XCTAssertEqual(decoded.productIds, [1])
        XCTAssertTrue(decoded.allowHidden)
        XCTAssertEqual(decoded.priceOverrides["1"], 3000)
        XCTAssertEqual(decoded.customItems.count, 1)
    }

    /// Contract snapshot: the JSON the iOS app sends to
    /// POST /api/pos/twint-intent. If this ever drifts from what
    /// server/pos.ts expects, the build breaks.
    ///
    /// The snapshot is taken with .sortedKeys — JSON object key order is not
    /// part of the wire contract, and Swift Dictionary iteration order is
    /// re-seeded every process, so comparing unsorted output is a coin flip.
    func testTwintIntentRequestMatchesBackendContractSnapshot() throws {
        let request = TwintIntentRequest(
            productIds: [1, 2],
            allowHidden: true,
            priceOverrides: ["1": 3500, "2": 2200],
            customItems: [CustomLineItemRequest(name: "Gift wrap", priceRappen: 500)]
        )

        let snapshotEncoder = JSONEncoder()
        snapshotEncoder.outputFormatting = .sortedKeys
        let data = try snapshotEncoder.encode(request)
        let jsonString = String(data: data, encoding: .utf8)!

        XCTAssertEqual(
            jsonString,
            #"{"allowHidden":true,"customItems":[{"name":"Gift wrap","priceRappen":500}],"priceOverrides":{"1":3500,"2":2200},"productIds":[1,2]}"#
        )
    }

    func testDecodesTwintIntentResponse() throws {
        let json = Data(#"{"redirectUrl":"https://hooks.stripe.com/twint/pi_1","paymentIntentId":"pi_1","posOrderId":7,"totalRappen":9000}"#.utf8)
        let response = try decoder.decode(TwintIntentResponse.self, from: json)

        XCTAssertEqual(response.redirectUrl, "https://hooks.stripe.com/twint/pi_1")
        XCTAssertEqual(response.paymentIntentId, "pi_1")
        XCTAssertEqual(response.posOrderId, 7)
        XCTAssertEqual(response.totalRappen, 9000)
    }
}
