import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var baseURL = ApiService.shared.baseURL
    @State private var apiKey = ApiService.shared.apiKey

    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Backend Connection")) {
                    TextField("Server URL", text: $baseURL)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                    SecureField("POS API Key", text: $apiKey)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                }
                Section {
                    Text("Enter the URL of your Zolto backend and the value of POS_API_KEY from your server .env file.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            .navigationTitle("POS Setup")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        ApiService.shared.configure(baseURL: baseURL, apiKey: apiKey)
                        dismiss()
                    }
                    .disabled(baseURL.isEmpty || apiKey.isEmpty)
                }
            }
        }
    }
}
