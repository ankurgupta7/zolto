import Foundation
import StripeTerminal

enum PaymentStatus: Equatable {
    case idle
    case preparingReader
    case notConfigured
    case creatingIntent
    case intentCreated(PaymentIntentResponse)
    case collectingPayment
    case processingPayment
    // Cash path — no Stripe involved, just recording the sale.
    case recordingCashSale
    // TWINT path — QR (the Stripe redirect URL) is on screen; we poll for success.
    case showingTwintQr(redirectUrl: String)
    // Succeeded now carries an `offline` flag so the UI can show "Sale recorded —
    // will sync when online" instead of silently looking like a normal online sale.
    case succeeded(posOrderId: Int, totalRappen: Int, offline: Bool)
    case failed(String)
    case cancelled
}

// Stripe Terminal Tap to Pay on iPhone (SDK v4.x).
//
// Flow: resolve the Stripe Terminal Location from the backend (GET /api/pos/config),
// discover the on-device Tap to Pay reader, connect it against that Location, then
// drive createPaymentIntent -> collect -> confirm. This mirrors the Android app so
// the two stay at feature parity.
//
// NOTE: Tap to Pay only works on a Stripe-allowlisted NFC iPhone with Tap to Pay
// enabled on the account and a valid Location; it cannot run on the simulator, so
// the reader path is verified on device, not in CI.
class PaymentViewModel: NSObject, ObservableObject {
    @Published var status: PaymentStatus = .idle

    private var cancelable: Cancelable?
    private var discoverCancelable: Cancelable?
    private var currentPosOrderId: Int = -1
    private var currentTotalRappen: Int = 0
    private var currentPaymentIntentId: String?
    private var productIds: [Int] = []
    private var allowHidden = false
    private var priceOverrides: [String: Int] = [:]
    private var customItems: [CustomLineItemRequest] = []
    private var terminalLocationId: String = ""
    private var isConnecting = false
    private var twintPollTask: Task<Void, Never>?

    // The customer opens the TWINT app, authorises, and comes back — poll for a
    // few minutes before giving up.
    private static let twintPollIntervalNanos: UInt64 = 2_500_000_000
    private static let twintPollMaxAttempts = 72 // ~3 minutes

    // MARK: - Entry point

    @MainActor
    func startPayment(
        productIds: [Int],
        allowHidden: Bool = false,
        priceOverrides: [String: Int] = [:],
        customItems: [CustomLineItemRequest] = []
    ) {
        self.productIds = productIds
        self.allowHidden = allowHidden
        self.priceOverrides = priceOverrides
        self.customItems = customItems
        status = .preparingReader
        Task { await prepareReaderThenCharge() }
    }

    // Cash is the only method that works fully offline. We always try the
    // direct API first; if it fails (network offline), we record the sale
    // locally via [OfflinePaymentManager] and show success — the transaction
    // will sync automatically when connectivity returns.
    @MainActor
    func startCashPayment(
        productIds: [Int],
        priceOverrides: [String: Int] = [:],
        customItems: [CustomLineItemRequest] = []
    ) {
        self.productIds = productIds
        status = .recordingCashSale
        let itemCount = productIds.count + customItems.count

        Task {
            do {
                let response = try await ApiService.shared.manualSale(
                    productIds: productIds,
                    paymentMethod: "cash",
                    priceOverrides: priceOverrides,
                    customItems: customItems
                )
                status = .succeeded(posOrderId: response.posOrderId, totalRappen: response.totalRappen, offline: false)
            } catch {
                // Direct API failed — fall back to offline recording.
                let total = customItems.reduce(0) { $0 + $1.priceRappen }
                let localId = try? await OfflinePaymentManager.shared.recordCashSale(
                    productIds: productIds,
                    priceOverrides: priceOverrides,
                    customItems: customItems,
                    totalRappen: total,
                    itemCount: itemCount
                )
                // Show success with an offline flag — the cashier knows the
                // sale is recorded locally and will sync when online.
                status = .succeeded(
                    posOrderId: localId?.hashValue ?? 0,
                    totalRappen: total,
                    offline: true
                )
            }
        }
    }

    // TWINT goes through Stripe: the backend creates + confirms a `twint`
    // PaymentIntent and returns a redirect URL, which we render as a QR code for
    // the customer to scan with their TWINT app. We then poll /pos/sale until
    // the PaymentIntent succeeds.
    //
    // NOTE: TWINT requires network — it cannot work offline.
    @MainActor
    func startTwintPayment(
        productIds: [Int],
        allowHidden: Bool = false,
        priceOverrides: [String: Int] = [:],
        customItems: [CustomLineItemRequest] = []
    ) {
        self.productIds = productIds
        status = .creatingIntent
        Task {
            do {
                let response = try await ApiService.shared.twintIntent(
                    productIds: productIds,
                    allowHidden: allowHidden,
                    priceOverrides: priceOverrides,
                    customItems: customItems
                )
                status = .showingTwintQr(redirectUrl: response.redirectUrl)
                pollTwintUntilPaid(
                    paymentIntentId: response.paymentIntentId,
                    posOrderId: response.posOrderId,
                    totalRappen: response.totalRappen
                )
            } catch {
                status = .failed(error.localizedDescription)
            }
        }
    }

    @MainActor
    private func pollTwintUntilPaid(paymentIntentId: String, posOrderId: Int, totalRappen: Int) {
        twintPollTask?.cancel()
        twintPollTask = Task { [weak self] in
            guard let self = self else { return }
            let itemCount = self.productIds.count + self.customItems.count
            for _ in 0..<Self.twintPollMaxAttempts {
                try? await Task.sleep(nanoseconds: Self.twintPollIntervalNanos)
                if Task.isCancelled { return }
                do {
                    let result = try await ApiService.shared.confirmSale(
                        posOrderId: posOrderId,
                        paymentIntentId: paymentIntentId
                    )
                    if result.success {
                        await MainActor.run {
                            self.status = .succeeded(posOrderId: posOrderId, totalRappen: totalRappen, offline: false)
                        }
                        return
                    }
                } catch {
                    // Polling error — keep waiting. If this is a definitive
                    // network failure after the user already paid, queue a
                    // backend confirmation for later sync.
                    if !OfflinePaymentManager.shared.isOnline {
                        await OfflinePaymentManager.shared.recordTwintBackendConfirm(
                            paymentIntentId: paymentIntentId,
                            posOrderId: posOrderId,
                            totalRappen: totalRappen,
                            itemCount: itemCount
                        )
                        await MainActor.run {
                            self.status = .succeeded(posOrderId: posOrderId, totalRappen: totalRappen, offline: true)
                        }
                        return
                    }
                }
            }
            await MainActor.run {
                self.status = .failed("TWINT payment wasn't completed. Please try again.")
            }
        }
    }

    // MARK: - Reader preparation

    @MainActor
    private func prepareReaderThenCharge() async {
        terminalLocationId = await resolveLocationId()
        guard !terminalLocationId.isEmpty else {
            status = .notConfigured
            return
        }

        // On a retry the Tap to Pay reader is usually still connected; skip
        // discovery and go straight to creating the payment intent.
        if Terminal.shared.connectedReader != nil {
            createPaymentIntent()
            return
        }

        do {
            let config = try TapToPayDiscoveryConfigurationBuilder().build()
            discoverCancelable = Terminal.shared.discoverReaders(config, delegate: self) { [weak self] error in
                guard let error = error else { return }
                Task { @MainActor in
                    self?.status = .failed("Reader discovery failed: \(error.localizedDescription)")
                }
            }
        } catch {
            status = .failed(error.localizedDescription)
        }
    }

    private func resolveLocationId() async -> String {
        do {
            return try await ApiService.shared.getConfig().locationId
        } catch {
            // Backend unreachable or not configured — treat as "not set up yet".
            return ""
        }
    }

    @MainActor
    private func connect(to reader: Reader) {
        status = .preparingReader
        do {
            let connectionConfig = try TapToPayConnectionConfigurationBuilder(
                delegate: self,
                locationId: terminalLocationId
            ).build()
            Terminal.shared.connectReader(reader, connectionConfig: connectionConfig) { [weak self] _, error in
                guard let self = self else { return }
                Task { @MainActor in
                    if let error = error {
                        self.isConnecting = false
                        self.status = .failed("Reader connection failed: \(error.localizedDescription)")
                    } else {
                        self.createPaymentIntent()
                    }
                }
            }
        } catch {
            isConnecting = false
            status = .failed(error.localizedDescription)
        }
    }

    // MARK: - Payment

    @MainActor
    private func createPaymentIntent() {
        status = .creatingIntent
        Task {
            do {
                let response = try await ApiService.shared.createPaymentIntent(
                    productIds: productIds,
                    allowHidden: allowHidden,
                    priceOverrides: priceOverrides,
                    customItems: customItems
                )
                guard response.totalRappen > 0 else {
                    status = .failed("Cart total came back as \(Money.label(0)) — refusing to charge. Please refresh the product list and try again.")
                    return
                }
                currentPosOrderId = response.posOrderId
                currentTotalRappen = response.totalRappen
                status = .intentCreated(response)
                await collectPayment(clientSecret: response.clientSecret)
            } catch {
                status = .failed(error.localizedDescription)
            }
        }
    }

    @MainActor
    private func collectPayment(clientSecret: String) async {
        status = .collectingPayment
        do {
            let intent = try await Terminal.shared.retrievePaymentIntent(clientSecret: clientSecret)
            currentPaymentIntentId = intent.stripeId

            // SDK v4.x has no async overload for collectPaymentMethod — bridge via continuation
            let collectedIntent: PaymentIntent = try await withCheckedThrowingContinuation { continuation in
                self.cancelable = Terminal.shared.collectPaymentMethod(intent) { result, error in
                    if let error = error {
                        continuation.resume(throwing: error)
                    } else if let result = result {
                        continuation.resume(returning: result)
                    }
                }
            }
            await processPayment(intent: collectedIntent)
        } catch {
            let nsError = error as NSError
            if nsError.code == ErrorCode.canceled.rawValue {
                status = .cancelled
            } else {
                status = .failed(error.localizedDescription)
            }
        }
    }

    @MainActor
    private func processPayment(intent: PaymentIntent) async {
        status = .processingPayment
        let itemCount = productIds.count + customItems.count
        do {
            // SDK v4.x has no async overload for confirmPaymentIntent — bridge via continuation
            let confirmedIntent: PaymentIntent = try await withCheckedThrowingContinuation { continuation in
                Terminal.shared.confirmPaymentIntent(intent) { result, error in
                    if let error = error {
                        continuation.resume(throwing: error)
                    } else if let result = result {
                        continuation.resume(returning: result)
                    }
                }
            }

            // Belt-and-suspenders: confirm via API even though the webhook
            // handles fulfillment. If this fails (network hiccup), queue the
            // confirmation for later sync — the card was already charged, so
            // we must never show a failure to the cashier.
            do {
                let _ = try await ApiService.shared.confirmSale(
                    posOrderId: currentPosOrderId,
                    paymentIntentId: confirmedIntent.stripeId ?? currentPaymentIntentId ?? ""
                )
                status = .succeeded(posOrderId: currentPosOrderId, totalRappen: currentTotalRappen, offline: false)
            } catch {
                // Backend confirm failed but card was already charged.
                // Queue for background sync and show success.
                await OfflinePaymentManager.shared.recordCardBackendConfirm(
                    paymentIntentId: confirmedIntent.stripeId ?? currentPaymentIntentId ?? "",
                    posOrderId: currentPosOrderId,
                    totalRappen: currentTotalRappen,
                    itemCount: itemCount
                )
                status = .succeeded(posOrderId: currentPosOrderId, totalRappen: currentTotalRappen, offline: true)
            }
        } catch {
            status = .failed(error.localizedDescription)
        }
    }

    func cancelPayment() {
        twintPollTask?.cancel()
        cancelable?.cancel { _ in }
        Task { @MainActor in status = .cancelled }
    }

    @MainActor
    func reset() {
        twintPollTask?.cancel()
        status = .idle
    }
}

// MARK: - DiscoveryDelegate

extension PaymentViewModel: DiscoveryDelegate {
    func terminal(_ terminal: Terminal, didUpdateDiscoveredReaders readers: [Reader]) {
        guard let reader = readers.first else { return }
        // Discovery keeps reporting readers; guard so we connect exactly once.
        if isConnecting || Terminal.shared.connectedReader != nil { return }
        isConnecting = true
        Task { @MainActor in self.connect(to: reader) }
    }
}

// MARK: - TapToPayReaderDelegate
// All required methods are implemented (mostly no-ops) so the delegate conforms;
// the UI is driven from `status` rather than these low-level reader events.

extension PaymentViewModel: TapToPayReaderDelegate {
    func tapToPayReader(_ reader: Reader, didStartInstallingUpdate update: ReaderSoftwareUpdate, cancelable: Cancelable?) {}
    func tapToPayReader(_ reader: Reader, didReportReaderSoftwareUpdateProgress progress: Float) {}
    func tapToPayReader(_ reader: Reader, didFinishInstallingUpdate update: ReaderSoftwareUpdate?, error: Error?) {}
    func tapToPayReader(_ reader: Reader, didRequestReaderInput inputOptions: ReaderInputOptions) {}
    func tapToPayReader(_ reader: Reader, didRequestReaderDisplayMessage displayMessage: ReaderDisplayMessage) {}
    func reader(_ reader: Reader, didDisconnect reason: DisconnectReason) {}
}
