import XCTest
@testable import GwinnPOS

final class MoneyTests: XCTestCase {

    // Money.parseChfToRappen is what stands between a cashier's typed
    // bargained price / custom item price and what actually gets charged, so
    // its parsing rules are worth pinning down precisely.

    func testParsesWholeNumber() {
        XCTAssertEqual(Money.parseChfToRappen("35"), 3500)
    }

    func testParsesDecimalWithDot() {
        XCTAssertEqual(Money.parseChfToRappen("35.50"), 3550)
    }

    func testParsesDecimalWithComma() {
        XCTAssertEqual(Money.parseChfToRappen("35,50"), 3550)
    }

    func testRoundsToNearestRappen() {
        XCTAssertEqual(Money.parseChfToRappen("10.006"), 1001)
        XCTAssertEqual(Money.parseChfToRappen("10.001"), 1000)
    }

    func testTrimsWhitespace() {
        XCTAssertEqual(Money.parseChfToRappen("  20.00  "), 2000)
    }

    func testAllowsZero() {
        XCTAssertEqual(Money.parseChfToRappen("0"), 0)
    }

    func testRejectsNegativeAmounts() {
        XCTAssertNil(Money.parseChfToRappen("-5"))
    }

    func testRejectsNonNumericInput() {
        XCTAssertNil(Money.parseChfToRappen("abc"))
    }

    func testRejectsBlankInput() {
        XCTAssertNil(Money.parseChfToRappen(""))
        XCTAssertNil(Money.parseChfToRappen("   "))
    }

    func testChfStringFormatsRappenAsTwoDecimals() {
        XCTAssertEqual(Money.chfString(3550), "35.50")
        XCTAssertEqual(Money.chfString(0), "0.00")
    }

    // Price labels follow the paired store's currency (multi-tenant): the
    // code comes from /api/pos/config lowercase and is shown uppercased.

    func testLabelUsesStoreCurrency() {
        let old = Money.currencyCode
        defer { Money.currencyCode = old }

        Money.currencyCode = "chf"
        XCTAssertEqual(Money.label(3550), "CHF 35.50")

        Money.currencyCode = "eur"
        XCTAssertEqual(Money.label(100), "EUR 1.00")
    }

    func testDisplayCurrencyFallsBackToDefaultWhenBlank() {
        let old = Money.currencyCode
        defer { Money.currencyCode = old }

        Money.currencyCode = "  "
        XCTAssertEqual(Money.displayCurrency, "CHF")
    }
}
