import XCTest
@testable import KalakoshPOS

final class CategoryFilterTests: XCTestCase {

    private let canonical = [
        "Necklaces", "Earrings", "Sets", "Rings", "Bracelets",
        "Bangles", "Anklets", "Brooches", "Hair Accessories", "Other",
    ]
    private let extraIncludes = [
        "Necklaces": ["Sets"],
        "Earrings": ["Sets"],
    ]

    // MARK: - visibleCategories

    func testVisibleCategoriesAlwaysStartsWithAll() {
        let result = CategoryFilter.visibleCategories(canonicalOrder: canonical, present: ["Rings"])
        XCTAssertEqual(result.first, "All")
    }

    func testVisibleCategoriesHidesEmptyCategories() {
        let result = CategoryFilter.visibleCategories(
            canonicalOrder: canonical, present: ["Necklaces", "Rings"]
        )
        XCTAssertEqual(result, ["All", "Necklaces", "Rings"])
    }

    func testVisibleCategoriesPreservesCanonicalOrder() {
        // Set iteration order must not leak — Necklaces must precede Rings.
        let result = CategoryFilter.visibleCategories(
            canonicalOrder: canonical, present: ["Rings", "Necklaces", "Other"]
        )
        XCTAssertEqual(result, ["All", "Necklaces", "Rings", "Other"])
    }

    func testVisibleCategoriesWithNoProductsIsJustAll() {
        XCTAssertEqual(
            CategoryFilter.visibleCategories(canonicalOrder: canonical, present: []),
            ["All"]
        )
    }

    func testVisibleCategoriesFallsBackToPresentWhenCanonicalEmpty() {
        let result = CategoryFilter.visibleCategories(canonicalOrder: [], present: ["Rings"])
        XCTAssertEqual(result, ["All", "Rings"])
    }

    func testVisibleCategoriesIgnoresUnknownPresentCategories() {
        let result = CategoryFilter.visibleCategories(
            canonicalOrder: canonical, present: ["Rings", "Ghost"]
        )
        XCTAssertEqual(result, ["All", "Rings"])
    }

    // MARK: - filter

    private struct Item { let id: Int; let category: String? }

    private let catalog = [
        Item(id: 1, category: "Necklaces"),
        Item(id: 2, category: "Earrings"),
        Item(id: 3, category: "Sets"),
        Item(id: 4, category: "Rings"),
        Item(id: 5, category: nil),
    ]

    private func ids(_ category: String) -> [Int] {
        CategoryFilter.filter(
            catalog, categoryOf: { $0.category },
            category: category, extraIncludes: extraIncludes
        ).map { $0.id }
    }

    func testFilterAllReturnsEverything() {
        XCTAssertEqual(ids("All"), [1, 2, 3, 4, 5])
    }

    func testFilterRingsReturnsOnlyRings() {
        XCTAssertEqual(ids("Rings"), [4])
    }

    func testFilterNecklacesFoldsInSets() {
        XCTAssertEqual(ids("Necklaces"), [1, 3])
    }

    func testFilterEarringsFoldsInSets() {
        XCTAssertEqual(ids("Earrings"), [2, 3])
    }

    func testFilterSetsDoesNotFoldBack() {
        XCTAssertEqual(ids("Sets"), [3])
    }

    func testFilterNeverMatchesNilCategory() {
        XCTAssertFalse(ids("Necklaces").contains(5))
        XCTAssertFalse(ids("Rings").contains(5))
    }

    func testFilterWithEmptyExtraIncludesDoesNoFolding() {
        let result = CategoryFilter.filter(
            catalog, categoryOf: { $0.category },
            category: "Necklaces", extraIncludes: [:]
        ).map { $0.id }
        XCTAssertEqual(result, [1])
    }
}
