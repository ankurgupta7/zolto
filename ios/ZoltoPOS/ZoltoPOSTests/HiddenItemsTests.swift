import XCTest
@testable import ZoltoPOS

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
}
