import XCTest
@testable import ZoltoPOS

/// The credential store contract that ApiService relies on: set/get/remove
/// round-trips and overwrite semantics. Exercised against the in-memory
/// implementation (deterministic in CI); KeychainStore implements the same
/// protocol and is exercised on device.
final class SecureStoreTests: XCTestCase {

    func testRoundTrip() {
        let store = InMemorySecureStore()
        XCTAssertNil(store.get("pos_api_key"))
        store.set("pos_api_key", to: "abc123")
        XCTAssertEqual(store.get("pos_api_key"), "abc123")
    }

    func testOverwriteReplacesValue() {
        let store = InMemorySecureStore()
        store.set("pos_api_key", to: "old")
        store.set("pos_api_key", to: "new")
        XCTAssertEqual(store.get("pos_api_key"), "new")
    }

    func testRemoveDeletesValue() {
        let store = InMemorySecureStore()
        store.set("pos_api_key", to: "abc123")
        store.remove("pos_api_key")
        XCTAssertNil(store.get("pos_api_key"))
    }

    func testKeysAreIndependent() {
        let store = InMemorySecureStore()
        store.set("pos_api_key", to: "key")
        store.set("pos_base_url", to: "https://zolto.ch")
        store.remove("pos_api_key")
        XCTAssertNil(store.get("pos_api_key"))
        XCTAssertEqual(store.get("pos_base_url"), "https://zolto.ch")
    }
}

/// ApiService's credential handling on top of a SecureStore: configure,
/// clearCredentials, and defaults — the logic behind pair/unpair.
final class ApiServiceCredentialTests: XCTestCase {

    func testDefaultsWhenUnconfigured() {
        let api = ApiService(store: InMemorySecureStore(), seedFromEnvironment: false)
        XCTAssertFalse(api.isConfigured)
        XCTAssertEqual(api.baseURL, Pairing.defaultBaseURL)
        XCTAssertEqual(api.apiKey, "")
    }

    func testConfigureTrimsAndPersists() {
        let store = InMemorySecureStore()
        let api = ApiService(store: store, seedFromEnvironment: false)
        api.configure(baseURL: " https://aurora.zolto.ch ", apiKey: " abc123 \n")
        XCTAssertTrue(api.isConfigured)
        XCTAssertEqual(store.get("pos_base_url"), "https://aurora.zolto.ch")
        XCTAssertEqual(store.get("pos_api_key"), "abc123")
    }

    func testClearCredentialsUnpairs() {
        let store = InMemorySecureStore()
        let api = ApiService(store: store, seedFromEnvironment: false)
        api.configure(baseURL: "https://zolto.ch", apiKey: "abc123")
        api.clearCredentials()
        XCTAssertFalse(api.isConfigured)
        XCTAssertNil(store.get("pos_api_key"))
        XCTAssertNil(store.get("pos_base_url"))
    }
}
