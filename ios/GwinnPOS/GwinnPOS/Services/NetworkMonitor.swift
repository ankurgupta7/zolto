import Foundation
import Network
import Combine

/// Emits the current network connectivity state via a published property.
/// Uses `NWPathMonitor` for accurate, real-time connectivity tracking on iOS.
///
/// ```swift
/// let monitor = NetworkMonitor()
/// monitor.start()
/// monitor.$isOnline.sink { online in ... }
/// ```
class NetworkMonitor: ObservableObject {
    @Published var isOnline: Bool = true

    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "NetworkMonitor")

    func start() {
        monitor.pathUpdateHandler = { [weak self] path in
            let online = path.status == .satisfied
            DispatchQueue.main.async {
                self?.isOnline = online
            }
        }
        monitor.start(queue: queue)
    }

    func stop() {
        monitor.cancel()
    }

    var isCurrentlyOnline: Bool {
        monitor.currentPath.status == .satisfied
    }
}
