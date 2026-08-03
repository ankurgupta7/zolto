import XCTest
@testable import KalakoshPOS

final class ProductQueryTests: XCTestCase {

    private struct Item { let id: Int; let category: String?; let text: String }

    private let extraIncludes = [
        "Necklaces": ["Sets"],
        "Earrings": ["Sets"],
    ]

    private let catalog = [
        Item(id: 1, category: "Rings", text: "Gold Ring handmade emerald 250.00"),
        Item(id: 2, category: "Necklaces", text: "Silver Necklace pearl 120.00"),
        Item(id: 3, category: "Sets", text: "Bridal Set gold 800.00"),
        Item(id: 4, category: "Earrings", text: "Silver Studs 45.00"),
    ]

    private func apply(_ category: String, _ query: String) -> [Int] {
        ProductQuery.apply(
            catalog,
            categoryOf: { $0.category },
            searchableTextOf: { $0.text },
            category: category,
            query: query,
            extraIncludes: extraIncludes
        ).map { $0.id }
    }

    func testBlankQueryBrowsesSelectedCategory() {
        XCTAssertEqual(apply("Rings", ""), [1])
    }

    func testBlankQueryOnFoldingCategoryIncludesSets() {
        XCTAssertEqual(apply("Necklaces", "   "), [2, 3])
    }

    func testQuerySearchesAcrossAllCategories() {
        // Browsing Rings, but searching "silver" still surfaces necklace + studs.
        XCTAssertEqual(apply("Rings", "silver"), [2, 4])
    }

    func testQueryMatchesPrice() {
        XCTAssertEqual(apply("All", "800"), [3])
    }

    func testQueryMatchesDescriptionWords() {
        XCTAssertEqual(apply("All", "emerald"), [1])
    }

    func testQueryIsCaseInsensitive() {
        XCTAssertEqual(apply("All", "GOLD RING"), [1])
    }

    func testMultipleTokensMustAllMatch() {
        XCTAssertEqual(apply("All", "gold bridal"), [3])
    }

    func testNoMatchReturnsEmpty() {
        XCTAssertTrue(apply("All", "platinum").isEmpty)
    }

    func testTokensSplitsAndTrims() {
        XCTAssertEqual(ProductQuery.tokens("  Gold   Ring "), ["gold", "ring"])
        XCTAssertTrue(ProductQuery.tokens("   ").isEmpty)
    }
}
