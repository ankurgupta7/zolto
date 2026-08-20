import XCTest
@testable import GwinnPOS

/// Tests for the Stripe-related API models and payment request/response types.
/// These verify that the JSON wire format matches what `server/pos.ts` (this repo)
/// expects and produces, so the iOS app and backend can never silently drift.
final class StripeModelsTests: XCTestCase {

    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    // MARK: - PaymentIntentRequest (card / Tap to Pay)

    func testPaymentIntentRequestEncodesMinimalPayload() throws {
        let request = PaymentIntentRequest(productIds: [1, 2])
        let data = try encoder.encode(request)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]

        XCTAssertEqual(json?["productIds"] as? [Int], [1, 2])
        XCTAssertEqual(json?["allowHidden"] as? Bool, false)
        XCTAssertNotNil(json?["priceOverrides"] as? [String: Int])
        XCTAssertNotNil(json?["customItems"] as? [[String: Any]])
    }

    func testPaymentIntentRequestEncodesPriceOverridesAsStringKeys() throws {
        let request = PaymentIntentRequest(
            productIds: [1],
            priceOverrides: ["1": 3500]
        )
        let data = try encoder.encode(request)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]

        let overrides = json?["priceOverrides"] as? [String: Int]
        XCTAssertEqual(overrides?["1"], 3500)
    }

    func testPaymentIntentRequestEncodesCustomItems() throws {
        let request = PaymentIntentRequest(
            productIds: [],
            customItems: [CustomLineItemRequest(name: "Custom repair", priceRappen: 1500)]
        )
        let data = try encoder.encode(request)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]

        let items = json?["customItems"] as? [[String: Any]]
        XCTAssertEqual(items?.count, 1)
        XCTAssertEqual(items?.first?["name"] as? String, "Custom repair")
        XCTAssertEqual(items?.first?["priceRappen"] as? Int, 1500)
    }

    func testPaymentIntentRequestEncodesAllowHidden() throws {
        let request = PaymentIntentRequest(productIds: [1], allowHidden: true)
        let data = try encoder.encode(request)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]

        XCTAssertEqual(json?["allowHidden"] as? Bool, true)
    }

    func testPaymentIntentRequestRoundTrips() throws {
        let original = PaymentIntentRequest(
            productIds: [1, 3],
            allowHidden: true,
            priceOverrides: ["1": 3500, "3": 2200],
            customItems: [CustomLineItemRequest(name: "Gift wrap", priceRappen: 500)]
        )
        let data = try encoder.encode(original)
        let decoded = try decoder.decode(PaymentIntentRequest.self, from: data)

        XCTAssertEqual(decoded.productIds, [1, 3])
        XCTAssertTrue(decoded.allowHidden)
        XCTAssertEqual(decoded.priceOverrides["1"], 3500)
        XCTAssertEqual(decoded.priceOverrides["3"], 2200)
        XCTAssertEqual(decoded.customItems.count, 1)
        XCTAssertEqual(decoded.customItems.first?.name, "Gift wrap")
    }

    // MARK: - PaymentIntentResponse

    func testDecodesPaymentIntentResponse() throws {
        let json = Data(#"{"clientSecret":"pi_test_secret","posOrderId":42,"totalRappen":15000}"#.utf8)
        let response = try decoder.decode(PaymentIntentResponse.self, from: json)

        XCTAssertEqual(response.clientSecret, "pi_test_secret")
        XCTAssertEqual(response.posOrderId, 42)
        XCTAssertEqual(response.totalRappen, 15000)
    }

    func testPaymentIntentResponseEquality() {
        let a = PaymentIntentResponse(clientSecret: "secret", posOrderId: 1, totalRappen: 5000)
        let b = PaymentIntentResponse(clientSecret: "secret", posOrderId: 1, totalRappen: 5000)
        let c = PaymentIntentResponse(clientSecret: "other", posOrderId: 2, totalRappen: 5000)

        XCTAssertEqual(a, b)
        XCTAssertNotEqual(a, c)
    }

    // MARK: - SaleRequest / SaleResponse

    func testSaleRequestEncodes() throws {
        let request = SaleRequest(posOrderId: 42, paymentIntentId: "pi_test_123")
        let data = try encoder.encode(request)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]

        XCTAssertEqual(json?["posOrderId"] as? Int, 42)
        XCTAssertEqual(json?["paymentIntentId"] as? String, "pi_test_123")
    }

    func testDecodesSaleResponseSuccess() throws {
        let json = Data(#"{"success":true}"#.utf8)
        let response = try decoder.decode(SaleResponse.self, from: json)

        XCTAssertTrue(response.success)
    }

    func testDecodesSaleResponseFailure() throws {
        let json = Data(#"{"success":false,"message":"Payment not completed"}"#.utf8)
        let response = try decoder.decode(SaleResponse.self, from: json)

        XCTAssertFalse(response.success)
        XCTAssertEqual(response.message, "Payment not completed")
    }

    // MARK: - ManualSaleRequest / ManualSaleResponse

    func testManualSaleRequestEncodesMinimalPayload() throws {
        let request = ManualSaleRequest(productIds: [1, 2], paymentMethod: "cash")
        let data = try encoder.encode(request)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]

        XCTAssertEqual(json?["productIds"] as? [Int], [1, 2])
        XCTAssertEqual(json?["paymentMethod"] as? String, "cash")
    }

    func testManualSaleRequestEncodesPriceOverridesAndCustomItems() throws {
        let request = ManualSaleRequest(
            productIds: [1],
            paymentMethod: "cash",
            priceOverrides: ["1": 3500],
            customItems: [CustomLineItemRequest(name: "Repair", priceRappen: 1000)]
        )
        let data = try encoder.encode(request)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]

        XCTAssertEqual((json?["priceOverrides"] as? [String: Int])?["1"], 3500)
        let items = json?["customItems"] as? [[String: Any]]
        XCTAssertEqual(items?.first?["name"] as? String, "Repair")
    }

    func testDecodesManualSaleResponse() throws {
        let json = Data(#"{"success":true,"posOrderId":55,"totalRappen":9000}"#.utf8)
        let response = try decoder.decode(ManualSaleResponse.self, from: json)

        XCTAssertTrue(response.success)
        XCTAssertEqual(response.posOrderId, 55)
        XCTAssertEqual(response.totalRappen, 9000)
    }

    // MARK: - ConnectionTokenResponse

    func testDecodesConnectionTokenResponse() throws {
        let json = Data(#"{"secret":"pst_test_secret"}"#.utf8)
        let response = try decoder.decode(ConnectionTokenResponse.self, from: json)

        XCTAssertEqual(response.secret, "pst_test_secret")
    }

    // MARK: - Regression: priceOverrides must be string-keyed

    /// This test guards against a backend contract break: the server expects
    /// priceOverrides keys as strings (JSON object keys are always strings),
    /// not integers. If the iOS encoder ever changes to output numeric keys,
    /// this test will catch it.
    func testPriceOverridesKeysAreAlwaysStrings() throws {
        let request = PaymentIntentRequest(
            productIds: [999],
            priceOverrides: ["999": 5000]
        )
        let data = try encoder.encode(request)
        let jsonString = String(data: data, encoding: .utf8)!

        // The encoded JSON must contain "999" as a string key, not 999 as a number
        XCTAssertTrue(jsonString.contains(#""999":5000"#) || jsonString.contains(#""999" : 5000"#))
    }
}
