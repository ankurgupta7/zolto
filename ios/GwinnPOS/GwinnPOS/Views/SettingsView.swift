import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var session = StoreSession.shared

    @State private var showingRepair = false
    @State private var confirmingUnpair = false

    private var maskedKey: String {
        let key = ApiService.shared.apiKey
        guard key.count > 8 else { return key.isEmpty ? "—" : "••••" }
        return "\(key.prefix(4))…\(key.suffix(4))"
    }

    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Paired store")) {
                    LabeledContent("Store", value: session.identity?.storeName ?? "—")
                    LabeledContent("Server", value: ApiService.shared.baseURL)
                    LabeledContent("POS key", value: maskedKey)
                    LabeledContent("Currency", value: Money.displayCurrency)
                }

                Section {
                    Button("Switch store / re-pair") {
                        showingRepair = true
                    }
                    Button("Unpair this device", role: .destructive) {
                        confirmingUnpair = true
                    }
                } footer: {
                    Text("Unpairing removes the stored POS API key from this device. Pair again any time with the key from your admin's Keys & access page.")
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .sheet(isPresented: $showingRepair) {
                PairingView {
                    showingRepair = false
                    dismiss()
                }
            }
            .confirmationDialog(
                "Unpair this device?",
                isPresented: $confirmingUnpair,
                titleVisibility: .visible
            ) {
                Button("Unpair", role: .destructive) {
                    session.unpair()
                    dismiss()
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("The POS API key will be removed from this device.")
            }
        }
    }
}
