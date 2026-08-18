import SwiftUI
import UIKit
import SafariServices

struct PaymentView: View {
    let productIds: [Int]
    let totalRappen: Int
    var allowHidden: Bool = false
    // "card" (default) drives Stripe Terminal Tap to Pay. "twint" opens Stripe's
    // hosted page in an in-app browser where the customer sees the real TWINT QR;
    // "cash" is recorded directly.
    var paymentMethod: String = "card"
    // Bargained price overrides / custom items apply to all three methods —
    // every backend endpoint (payment-intent, manual-sale, twint-intent)
    // resolves them identically.
    var priceOverrides: [String: Int] = [:]
    var customItems: [CustomLineItemRequest] = []

    // Shown when the backend has no Stripe Terminal Location configured. Mirrors
    // the Android "card payments not set up yet" setup guidance.
    private static let setupInstructions = """
    Tap to Pay needs your store's Stripe account and a Terminal Location before it can accept cards on this phone.

    To fix this:

    1. In your store admin, connect your Stripe account (Admin → Payments) so card payments land in your own account.

    2. Install the Stripe Dashboard app and confirm “Tap to Pay on this phone” works there first. This enables Tap to Pay on your account and completes the one-time setup on this device.

    3. Reopen this screen — the Terminal Location is provisioned automatically once Stripe is connected.
    """

    @StateObject private var paymentViewModel = PaymentViewModel()
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var productViewModel: ProductViewModel

    // Controls the full-screen Safari view used for TWINT payments.
    // When the backend returns a Stripe redirect URL, we open it in
    // SFSafariViewController so the customer sees Stripe's hosted page
    // with the genuine TWINT QR code (which the TWINT app recognises).
    @State private var showingTwintSafari = false

    var body: some View {
        ZStack {
            Color.zoltoBackground.ignoresSafeArea()

            VStack(spacing: 32) {
                Spacer()
                statusContent
                Spacer()
                actionButtons
            }
            .padding(32)
        }
        .onAppear {
            startPayment()
        }
        // Full-screen Safari view for TWINT.  The cashier sees the underlying
        // "Waiting…" spinner; the *customer* uses the Safari view to scan the
        // real TWINT QR on Stripe's hosted page.
        .fullScreenCover(
            isPresented: $showingTwintSafari,
            onDismiss: {
                // User tapped Done in Safari — cancel the payment unless we
                // already advanced to a terminal state (success / fail).
                if case .showingTwintQr = paymentViewModel.status {
                    paymentViewModel.cancelPayment()
                }
            }
        ) {
            if case .showingTwintQr(let url) = paymentViewModel.status {
                SafariView(url: URL(string: url)!)
            }
        }
        .onChange(of: paymentViewModel.status) { newStatus in
            if case .showingTwintQr = newStatus {
                showingTwintSafari = true
            } else {
                showingTwintSafari = false
            }
        }
    }

    // MARK: - Extracted view builders (avoid type-checker timeout)
    // Each piece is isolated in its own @ViewBuilder so the compiler
    // never has to type-check the entire body as a single expression.

    @ViewBuilder
    private var statusContent: some View {
        switch paymentViewModel.status {
        case .idle, .collectingPayment:
            idleCollectingView
        case .creatingIntent:
            creatingIntentView
        case .preparingReader, .intentCreated:
            preparingReaderView
        case .notConfigured:
            notConfiguredView
        case .processingPayment:
            processingView
        case .recordingCashSale:
            recordingCashView
        case .showingTwintQr(let url):
            twintQrView(redirectUrl: url)
        case .succeeded(let oid, let tot, _):
            succeededView(orderId: oid, total: tot)
        case .failed(let msg):
            failedView(message: msg)
        case .cancelled:
            cancelledView
        }
    }

    @ViewBuilder
    private var actionButtons: some View {
        switch paymentViewModel.status {
        case .succeeded:
            Button("Done") {
                productViewModel.clearSelection()
                dismiss()
            }
            .buttonStyle(ZoltoAccentButtonStyle())
            .padding(.horizontal, 32)
        case .notConfigured:
            Button("Done") { dismiss() }
                .buttonStyle(ZoltoOutlinedButtonStyle())
                .padding(.horizontal, 32)
        case .failed:
            HStack(spacing: 16) {
                Button("Cancel") { dismiss() }
                    .buttonStyle(ZoltoOutlinedButtonStyle())
                Button("Try Again") { startPayment() }
                    .buttonStyle(ZoltoPrimaryButtonStyle())
            }
            .padding(.horizontal, 32)
        case .recordingCashSale:
            EmptyView()
        default:
            Button("Cancel") {
                paymentViewModel.cancelPayment()
                dismiss()
            }
            .buttonStyle(ZoltoOutlinedButtonStyle())
        }
    }

    // MARK: - Status sub-views (each small enough for the type-checker)

    private var idleCollectingView: some View {
        VStack(spacing: 32) {
            ProgressView()
                .progressViewStyle(.circular)
                .scaleEffect(1.4)
                .tint(.zoltoInk)
            Text("Tap card or phone")
                .font(.title2.weight(.medium))
                .foregroundColor(.zoltoInk)
                .tracking(0.5)
        }
    }

    private var creatingIntentView: some View {
        VStack(spacing: 32) {
            ProgressView()
                .progressViewStyle(.circular)
                .tint(.zoltoInk)
            Text("Preparing…")
                .foregroundColor(.zoltoMuted)
        }
    }

    private var preparingReaderView: some View {
        VStack(spacing: 32) {
            ProgressView()
                .progressViewStyle(.circular)
                .tint(.zoltoInk)
            Text("Preparing card reader…")
                .foregroundColor(.zoltoMuted)
        }
    }

    private var notConfiguredView: some View {
        VStack(spacing: 32) {
            Image(systemName: "creditcard.trianglebadge.exclamationmark")
                .font(.system(size: 64))
                .foregroundColor(.zoltoAccent)
            Text("Card payments not set up yet")
                .font(.title2.weight(.bold))
                .foregroundColor(.zoltoInk)
                .multilineTextAlignment(.center)
            Text(Self.setupInstructions)
                .font(.callout)
                .multilineTextAlignment(.leading)
                .foregroundColor(.zoltoMuted)
                .padding(.horizontal, 8)
        }
    }

    private var processingView: some View {
        VStack(spacing: 32) {
            ProgressView()
                .progressViewStyle(.circular)
                .tint(.zoltoInk)
            Text("Processing payment…")
                .foregroundColor(.zoltoMuted)
        }
    }

    private var recordingCashView: some View {
        VStack(spacing: 32) {
            ProgressView()
                .progressViewStyle(.circular)
                .tint(.zoltoInk)
            Text("Recording cash sale…")
                .foregroundColor(.zoltoMuted)
        }
    }

    // TWINT: instead of encoding the Stripe redirect URL as a local QR code
    // (which the TWINT app rejects — it expects a TWINT-native payload), we
    // open Stripe's hosted page in an in-app Safari view.  That page shows
    // the *genuine* TWINT QR code that the TWINT app recognises.  The cashier
    // sees this spinner while the customer pays in the Safari view.
    private func twintQrView(redirectUrl: String) -> some View {
        VStack(spacing: 32) {
            ProgressView()
                .progressViewStyle(.circular)
                .scaleEffect(1.4)
                .tint(.zoltoInk)
            Text("TWINT payment")
                .font(.title2.weight(.medium))
                .foregroundColor(.zoltoInk)
                .tracking(0.5)
            Text("Waiting for the customer to confirm…")
                .font(.callout)
                .foregroundColor(.zoltoMuted)
                .multilineTextAlignment(.center)
        }
    }

    private func succeededView(orderId: Int, total: Int) -> some View {
        VStack(spacing: 32) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 80))
                .foregroundColor(.zoltoAccent)
            Text("Payment Successful")
                .font(.title.weight(.bold))
                .foregroundColor(.zoltoInk)
                .tracking(0.5)
            VStack(spacing: 6) {
                Text("Order #\(orderId)")
                    .foregroundColor(.zoltoMuted)
                    .font(.subheadline)
                Text(Money.label(total))
                    .font(.title2.weight(.bold))
                    .foregroundColor(.zoltoAccent)
            }
        }
    }

    private func failedView(message: String) -> some View {
        VStack(spacing: 32) {
            Image(systemName: "xmark.circle.fill")
                .font(.system(size: 80))
                .foregroundColor(.red)
            Text("Payment Failed")
                .font(.title.weight(.bold))
                .foregroundColor(.zoltoInk)
            Text(message)
                .multilineTextAlignment(.center)
                .foregroundColor(.zoltoMuted)
                .padding()
        }
    }

    private var cancelledView: some View {
        Text("Payment Cancelled")
            .font(.title)
            .foregroundColor(.zoltoInk)
    }

    private func startPayment() {
        switch paymentMethod {
        case "twint":
            paymentViewModel.startTwintPayment(
                productIds: productIds,
                allowHidden: allowHidden,
                priceOverrides: priceOverrides,
                customItems: customItems
            )
        case "cash":
            paymentViewModel.startCashPayment(
                productIds: productIds,
                allowHidden: allowHidden,
                priceOverrides: priceOverrides,
                customItems: customItems
            )
        default:
            paymentViewModel.startPayment(
                productIds: productIds,
                allowHidden: allowHidden,
                priceOverrides: priceOverrides,
                customItems: customItems
            )
        }
    }
}

// MARK: - SafariView

/// Wraps `SFSafariViewController` for use in SwiftUI.  Used for TWINT so the
/// customer sees Stripe's hosted page with the genuine TWINT QR code.
struct SafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let vc = SFSafariViewController(url: url)
        vc.dismissButtonStyle = .cancel
        return vc
    }

    func updateUIViewController(_ uiViewController: SFSafariViewController, context: Context) {}
}
