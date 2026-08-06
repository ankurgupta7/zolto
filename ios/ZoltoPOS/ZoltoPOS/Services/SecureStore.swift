import Foundation
import Security

/// Minimal string key-value storage for the pairing credentials. Backed by the
/// iOS Keychain in the app (`KeychainStore`); tests use `InMemorySecureStore`
/// so pairing logic is testable without Keychain entitlements.
protocol SecureStore {
    func get(_ key: String) -> String?
    func set(_ key: String, to value: String)
    func remove(_ key: String)
}

/// Keychain-backed store for the POS API key and server URL. These are bearer
/// credentials for the merchant's store, so they live in the Keychain — not
/// UserDefaults, which is trivially readable from a device backup.
final class KeychainStore: SecureStore {
    private let service: String

    init(service: String = "ch.zolto.pos.credentials") {
        self.service = service
    }

    private func query(for key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
    }

    func get(_ key: String) -> String? {
        var q = query(for: key)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        let status = SecItemCopyMatching(q as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func set(_ key: String, to value: String) {
        let data = Data(value.utf8)
        var q = query(for: key)
        // The POS must keep working across reboots while locked in a drawer,
        // but the credential should never leave this device via backups.
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        q[kSecValueData as String] = data
        let status = SecItemAdd(q as CFDictionary, nil)
        if status == errSecDuplicateItem {
            SecItemUpdate(
                query(for: key) as CFDictionary,
                [kSecValueData as String: data] as CFDictionary
            )
        }
    }

    func remove(_ key: String) {
        SecItemDelete(query(for: key) as CFDictionary)
    }
}

/// Deterministic stand-in for tests.
final class InMemorySecureStore: SecureStore {
    private var values: [String: String] = [:]

    func get(_ key: String) -> String? { values[key] }
    func set(_ key: String, to value: String) { values[key] = value }
    func remove(_ key: String) { values.removeValue(forKey: key) }
}
