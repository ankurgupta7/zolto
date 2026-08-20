import XCTest
@testable import GwinnPOS

final class HiddenItemsTests: XCTestCase {

    // The cashier's "Show Hidden Items" toggle relies on `Product.visible` and
    // `PaymentIntentRequest.allowHidden` round-tripping correctly against the
    // shared backend, so decoding/encoding these fields is what drives the
    // hidden badge and the payment-intent override.

    func testDecodesVisibleFalse() throws {
        let json = Data(#"""
        {"id":1,"name":"Ring","nameEn":null,"price":"10.00","priceRappen":1000,
         "category":"Rings","imageUrl":null,"imageKey":null,"quantity":1,"visible":false}
        """#.utf8)
        let product = try JSONDecoder().decode(Product.self, from: json)
        XCTAssertFalse(product.visible)
    }

    func testDefaultsVisibleTrueWhenFieldMissing() throws {
        let json = Data(#"""
        {"id":1,"name":"Ring","nameEn":null,"price":"10.00","priceRappen":1000,
         "category":"Rings","imageUrl":null,"imageKey":null,"quantity":1}
        """#.utf8)
        let product = try JSONDecoder().decode(Product.self, from: json)
        XCTAssertTrue(product.visible)
    }

    func testDefaultInitVisibleIsTrue() {
        let product = Product(
            id: 1, name: "Ring", nameEn: nil, price: "10.00", priceRappen: 1000,
            category: "Rings", imageUrl: nil, imageKey: nil, quantity: 1
        )
        XCTAssertTrue(product.visible)
    }

    func testPaymentIntentRequestDefaultsAllowHiddenFalse() throws {
        let request = PaymentIntentRequest(productIds: [1, 2])
        XCTAssertFalse(request.allowHidden)

        let data = try JSONEncoder().encode(request)
        let decoded = try JSONDecoder().decode(PaymentIntentRequest.self, from: data)
        XCTAssertEqual(decoded.productIds, [1, 2])
        XCTAssertFalse(decoded.allowHidden)
    }

    func testPaymentIntentRequestEncodesAllowHiddenTrue() throws {
        let request = PaymentIntentRequest(productIds: [3], allowHidden: true)
        let data = try JSONEncoder().encode(request)
        let decoded = try JSONDecoder().decode(PaymentIntentRequest.self, from: data)
        XCTAssertTrue(decoded.allowHidden)
    }

    // MARK: - Cash sales

    // The card and TWINT paths have always sent allowHidden; the cash path did
    // not have the field at all, so the backend's availability check
    // ((allowHidden || visible) && !sold && quantity > 0) refused every hidden
    // piece sold for cash with a 409 "One or more items are no longer
    // available".
    func testManualSaleRequestEncodesAllowHiddenTrue() throws {
        let request = ManualSaleRequest(
            productIds: [1],
            paymentMethod: "cash",
            allowHidden: true
        )
        let json = try JSONSerialization.jsonObject(
            with: try JSONEncoder().encode(request)
        ) as? [String: Any]

        XCTAssertEqual(json?["allowHidden"] as? Bool, true)
    }

    func testManualSaleRequestDefaultsAllowHiddenFalse() throws {
        let request = ManualSaleRequest(productIds: [1], paymentMethod: "cash")
        let json = try JSONSerialization.jsonObject(
            with: try JSONEncoder().encode(request)
        ) as? [String: Any]

        XCTAssertEqual(json?["allowHidden"] as? Bool, false)
    }

    // A sale queued offline is replayed from its stored payload, so the
    // override has to survive the round trip — otherwise the retry is refused
    // for a reason the cashier already overrode.
    func testQueuedPayloadRoundTripsAllowHidden() {
        let payload = PendingTransactionPayload(
            productIds: [42],
            paymentMethod: "cash",
            allowHidden: true
        )
        let restored = PendingTransactionSerializer.fromJson(
            PendingTransactionSerializer.toJson(payload)
        )

        XCTAssertTrue(restored.allowHidden)
        XCTAssertEqual(restored.productIds, [42])
    }

    func testQueuedPayloadDefaultsAllowHiddenFalse() {
        let restored = PendingTransactionSerializer.fromJson(
            PendingTransactionSerializer.toJson(
                PendingTransactionPayload(productIds: [1], paymentMethod: "cash")
            )
        )
        XCTAssertFalse(restored.allowHidden)
    }
}
