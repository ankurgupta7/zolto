import XCTest
@testable import GwinnPOS

// Main-actor isolated because the cart tests build a ProductViewModel, whose
// init is @MainActor. Without this the test target does not compile.
@MainActor
final class PriceOverrideAndCustomItemTests: XCTestCase {

    // MARK: - PaymentIntentRequest wire format

    func testPaymentIntentRequestDefaultsHaveNoOverridesOrCustomItems() {
        let request = PaymentIntentRequest(productIds: [1, 2])
        XCTAssertTrue(request.priceOverrides.isEmpty)
        XCTAssertTrue(request.customItems.isEmpty)
    }

    func testPaymentIntentRequestEncodesPriceOverridesAsAStringKeyedObject() throws {
        let request = PaymentIntentRequest(productIds: [1], priceOverrides: ["1": 3500])
        let data = try JSONEncoder().encode(request)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let overrides = json?["priceOverrides"] as? [String: Any]
        XCTAssertEqual(overrides?["1"] as? Int, 3500)
    }

    func testPaymentIntentRequestRoundTripsCustomItems() throws {
        let request = PaymentIntentRequest(
            productIds: [],
            customItems: [CustomLineItemRequest(name: "Custom repair", priceRappen: 1500)]
        )
        let data = try JSONEncoder().encode(request)
        let decoded = try JSONDecoder().decode(PaymentIntentRequest.self, from: data)
        XCTAssertEqual(decoded.customItems.count, 1)
        XCTAssertEqual(decoded.customItems.first?.name, "Custom repair")
        XCTAssertEqual(decoded.customItems.first?.priceRappen, 1500)
    }

    func testManualSaleRequestDefaultsHaveNoOverridesOrCustomItems() {
        let request = ManualSaleRequest(productIds: [1], paymentMethod: "cash")
        XCTAssertTrue(request.priceOverrides.isEmpty)
        XCTAssertTrue(request.customItems.isEmpty)
    }

    func testManualSaleRequestRoundTripsPriceOverridesAndCustomItems() throws {
        let request = ManualSaleRequest(
            productIds: [1],
            paymentMethod: "cash",
            priceOverrides: ["1": 3500],
            customItems: [CustomLineItemRequest(name: "Custom repair", priceRappen: 1000)]
        )
        let data = try JSONEncoder().encode(request)
        let decoded = try JSONDecoder().decode(ManualSaleRequest.self, from: data)
        XCTAssertEqual(decoded.priceOverrides["1"], 3500)
        XCTAssertEqual(decoded.customItems.first?.name, "Custom repair")
    }

    func testTwintIntentRequestRoundTripsPriceOverridesAndCustomItems() throws {
        let request = TwintIntentRequest(
            productIds: [1],
            priceOverrides: ["1": 3500],
            customItems: [CustomLineItemRequest(name: "Custom repair", priceRappen: 1000)]
        )
        let data = try JSONEncoder().encode(request)
        let decoded = try JSONDecoder().decode(TwintIntentRequest.self, from: data)
        XCTAssertEqual(decoded.priceOverrides["1"], 3500)
        XCTAssertEqual(decoded.customItems.first?.name, "Custom repair")
    }

    // MARK: - SaleItem decoding (GET /api/pos/sales response shape)

    func testDecodesACatalogueItemWithAProductId() throws {
        let json = Data(#"{"productId":7,"productName":"Silver Ring","priceRappen":5000}"#.utf8)
        let item = try JSONDecoder().decode(SaleItem.self, from: json)
        XCTAssertEqual(item.productId, 7)
        XCTAssertEqual(item.displayName, "Silver Ring")
        XCTAssertEqual(item.priceRappen, 5000)
    }

    func testDecodesACustomItemWithNoProductId() throws {
        let json = Data(#"{"productId":null,"productName":"Custom repair fee","priceRappen":1500}"#.utf8)
        let item = try JSONDecoder().decode(SaleItem.self, from: json)
        XCTAssertNil(item.productId)
        XCTAssertEqual(item.displayName, "Custom repair fee")
    }

    // MARK: - ProductViewModel cart logic
    //
    // ProductViewModel.init is @MainActor (it subscribes to the main-actor
    // OfflinePaymentManager), so every test that constructs one must run on
    // the main actor too. XCTest executes synchronous tests on the main
    // thread, so the annotation only makes that explicit to the compiler.

    @MainActor
    func testChargedPriceIsListPriceWhenNoOverrideSet() {
        let viewModel = ProductViewModel()
        let product = Product(
            id: 1, name: "Ring", nameEn: nil, price: "50.00", priceRappen: 5000,
            category: "Rings", imageUrl: nil, imageKey: nil, quantity: 1
        )
        XCTAssertEqual(viewModel.chargedPriceRappen(for: product), 5000)
    }

    @MainActor
    func testChargedPriceIsTheBargainedOverrideWhenSet() {
        let viewModel = ProductViewModel()
        let product = Product(
            id: 1, name: "Ring", nameEn: nil, price: "50.00", priceRappen: 5000,
            category: "Rings", imageUrl: nil, imageKey: nil, quantity: 1
        )
        viewModel.setPriceOverride(productId: 1, priceRappen: 3500)
        XCTAssertEqual(viewModel.chargedPriceRappen(for: product), 3500)
    }

    @MainActor
    func testSettingOverrideToNilClearsIt() {
        let viewModel = ProductViewModel()
        let product = Product(
            id: 1, name: "Ring", nameEn: nil, price: "50.00", priceRappen: 5000,
            category: "Rings", imageUrl: nil, imageKey: nil, quantity: 1
        )
        viewModel.setPriceOverride(productId: 1, priceRappen: 3500)
        viewModel.setPriceOverride(productId: 1, priceRappen: nil)
        XCTAssertEqual(viewModel.chargedPriceRappen(for: product), 5000)
    }

    @MainActor
    func testDeselectingAProductClearsItsOverride() {
        let viewModel = ProductViewModel()
        viewModel.toggleSelection(productId: 1)
        viewModel.setPriceOverride(productId: 1, priceRappen: 3500)
        XCTAssertEqual(viewModel.priceOverrides[1], 3500)

        viewModel.toggleSelection(productId: 1)
        XCTAssertNil(viewModel.priceOverrides[1])
    }

    @MainActor
    func testAddAndRemoveCustomItem() {
        let viewModel = ProductViewModel()
        viewModel.addCustomItem(name: "Custom bracelet", priceRappen: 4200)
        XCTAssertEqual(viewModel.customItems.count, 1)
        XCTAssertEqual(viewModel.totalRappen(), 4200)

        let id = viewModel.customItems[0].id
        viewModel.removeCustomItem(id: id)
        XCTAssertTrue(viewModel.customItems.isEmpty)
        XCTAssertEqual(viewModel.totalRappen(), 0)
    }

    @MainActor
    func testClearSelectionClearsOverridesAndCustomItemsToo() {
        let viewModel = ProductViewModel()
        viewModel.toggleSelection(productId: 1)
        viewModel.setPriceOverride(productId: 1, priceRappen: 3500)
        viewModel.addCustomItem(name: "Custom bracelet", priceRappen: 4200)

        viewModel.clearSelection()

        XCTAssertTrue(viewModel.selectedIds.isEmpty)
        XCTAssertTrue(viewModel.priceOverrides.isEmpty)
        XCTAssertTrue(viewModel.customItems.isEmpty)
    }
}
