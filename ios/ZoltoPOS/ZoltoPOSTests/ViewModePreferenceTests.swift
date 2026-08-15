import XCTest
@testable import ZoltoPOS

/// The picker's layout default and the rule that remembers a cashier's choice.
final class ViewModePreferenceTests: XCTestCase {

    // The whole point of the change: a fresh install opens in the list, where
    // a full product name fits, not the grid, where it is clipped.
    func testFirstRunDefaultsToList() {
        XCTAssertEqual(ViewModePreference.resolve(stored: nil), .list)
        XCTAssertEqual(ViewModePreference.defaultMode, .list)
    }

    func testBlankStoredValueFallsBackToDefault() {
        XCTAssertEqual(ViewModePreference.resolve(stored: ""), .list)
    }

    func testStoredChoiceIsHonoured() {
        XCTAssertEqual(ViewModePreference.resolve(stored: "Grid"), .grid)
        XCTAssertEqual(ViewModePreference.resolve(stored: "List"), .list)
    }

    func testStoredValueIsCaseInsensitive() {
        XCTAssertEqual(ViewModePreference.resolve(stored: "grid"), .grid)
        XCTAssertEqual(ViewModePreference.resolve(stored: "LIST"), .list)
    }

    // A value left behind by an older build must not strand the picker in an
    // unrenderable state.
    func testUnknownStoredValueFallsBackToDefault() {
        XCTAssertEqual(ViewModePreference.resolve(stored: "carousel"), .list)
    }

    // resolve() has to accept exactly what the didSet writes back, or the
    // choice silently resets on the next launch.
    func testRawValuesRoundTrip() {
        for mode in ProductViewMode.allCases {
            XCTAssertEqual(ViewModePreference.resolve(stored: mode.rawValue), mode)
        }
    }

    func testViewModelPersistsAndRestoresTheChoice() {
        let defaults = UserDefaults.standard
        let key = ViewModePreference.storageKey
        let original = defaults.string(forKey: key)
        defer {
            if let original { defaults.set(original, forKey: key) }
            else { defaults.removeObject(forKey: key) }
        }

        defaults.removeObject(forKey: key)
        let fresh = ProductViewModel()
        XCTAssertEqual(fresh.viewMode, .list, "a fresh install opens in the list")

        fresh.viewMode = .grid
        XCTAssertEqual(defaults.string(forKey: key), ProductViewMode.grid.rawValue)

        let relaunched = ProductViewModel()
        XCTAssertEqual(relaunched.viewMode, .grid, "the cashier's choice survives a restart")
    }
}
