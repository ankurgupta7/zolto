import SwiftUI

/// First-run pairing: connect this device to a Gwinn store with its POS API
/// key (scanned as a QR code or typed) and server URL. Credentials are only
/// saved after a successful probe against the server, so a typo can't strand
/// the app half-configured.
struct PairingView: View {
    @ObservedObject private var session = StoreSession.shared

    @State private var baseURL: String
    @State private var apiKey: String = ""
    @State private var showingScanner = false
    @State private var isConnecting = false
    @State private var errorMessage: String?

    /// Called after pairing succeeds (e.g. to reload products).
    var onPaired: (() -> Void)?

    init(onPaired: (() -> Void)? = nil) {
        self.onPaired = onPaired
        // Prefill with whatever we knew last — after a forced re-pair the
        // server URL is almost always still right, only the key changed.
        _baseURL = State(initialValue: ApiService.shared.isConfigured
            ? ApiService.shared.baseURL
            : Pairing.defaultBaseURL)
    }

    var body: some View {
        NavigationView {
            ZStack {
                Color.brandBackground.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 24) {
                        header

                        if let message = session.pairingMessage {
                            noticeBox(message, color: .orange)
                        }
                        if let message = errorMessage {
                            noticeBox(message, color: .red)
                        }

                        VStack(spacing: 16) {
                            Button {
                                showingScanner = true
                            } label: {
                                Label("Scan pairing QR code", systemImage: "qrcode.viewfinder")
                            }
                            .buttonStyle(BrandPrimaryButtonStyle())

                            Text("or enter the details manually")
                                .font(.caption)
                                .foregroundColor(.brandMuted)
                        }

                        VStack(alignment: .leading, spacing: 12) {
                            Text("POS API key")
                                .font(.caption.weight(.semibold))
                                .foregroundColor(.brandMuted)
                            SecureField("Paste your store's POS API key", text: $apiKey)
                                .textFieldStyle(.roundedBorder)
                                .autocorrectionDisabled()
                                .textInputAutocapitalization(.never)

                            Text("Server URL")
                                .font(.caption.weight(.semibold))
                                .foregroundColor(.brandMuted)
                            TextField(Pairing.defaultBaseURL, text: $baseURL)
                                .textFieldStyle(.roundedBorder)
                                .autocorrectionDisabled()
                                .textInputAutocapitalization(.never)
                                .keyboardType(.URL)

                            Text("Find the key in your store admin under Account \u{2192} Keys & access. Self-hosted stores enter their own server URL.")
                                .font(.caption)
                                .foregroundColor(.brandMuted)
                        }

                        Button {
                            Task { await connect() }
                        } label: {
                            if isConnecting {
                                ProgressView().tint(.brandBackground)
                            } else {
                                Text("Connect")
                            }
                        }
                        .buttonStyle(BrandPrimaryButtonStyle())
                        .disabled(isConnecting || Pairing.normalizeKey(apiKey) == nil)
                    }
                    .padding(24)
                }
            }
            .navigationTitle("Pair with your store")
            .navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $showingScanner) {
                NavigationView {
                    QRScannerView { payload in
                        showingScanner = false
                        handleScan(payload)
                    }
                    .ignoresSafeArea()
                    .navigationTitle("Scan QR code")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") { showingScanner = false }
                        }
                    }
                }
            }
        }
    }

    private var header: some View {
        VStack(spacing: 8) {
            Text("GWINN POS")
                .font(.system(.title3, design: .default).weight(.bold))
                .tracking(4)
                .foregroundColor(.brandInk)
            Text("Pair this device with your store to start selling.")
                .font(.subheadline)
                .foregroundColor(.brandMuted)
                .multilineTextAlignment(.center)
        }
        .padding(.top, 16)
    }

    private func noticeBox(_ message: String, color: Color) -> some View {
        Text(message)
            .font(.callout)
            .foregroundColor(color)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(color.opacity(0.1))
            .cornerRadius(6)
    }

    private func handleScan(_ payload: String) {
        guard let credentials = Pairing.parseQrPayload(payload) else {
            errorMessage = "That QR code doesn't look like a Gwinn POS pairing code."
            return
        }
        apiKey = credentials.apiKey
        if let scannedURL = credentials.baseURL {
            baseURL = scannedURL
        }
        Task { await connect() }
    }

    private func connect() async {
        errorMessage = nil
        guard let key = Pairing.normalizeKey(apiKey) else {
            errorMessage = "Enter your store's POS API key."
            return
        }
        guard let url = Pairing.normalizeBaseURL(baseURL) else {
            errorMessage = "The server URL is not valid."
            return
        }

        isConnecting = true
        defer { isConnecting = false }
        do {
            let config = try await ApiService.probe(baseURL: url, apiKey: key)
            session.completePairing(baseURL: url, apiKey: key, config: config)
            onPaired?()
        } catch ApiError.unauthorized {
            errorMessage = "The server didn't recognise that POS key. Check it in your admin under Keys & access \u{2014} rotating the key invalidates the old one."
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
