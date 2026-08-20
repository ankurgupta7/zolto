import SwiftUI

struct SalesHistoryView: View {
    @StateObject private var viewModel = SalesHistoryViewModel()
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationView {
            ZStack {
                Color.brandBackground.ignoresSafeArea()

                switch viewModel.salesState {
                case .idle, .loading:
                    ProgressView()
                        .progressViewStyle(.circular)
                        .tint(.brandInk)

                case .success(let sales):
                    if sales.isEmpty {
                        Text("No sales recorded yet")
                            .foregroundColor(.brandMuted)
                    } else {
                        List(sales) { sale in
                            VStack(alignment: .leading, spacing: 5) {
                                HStack {
                                    Text(sale.createdAt)
                                        .font(.caption)
                                        .foregroundColor(.brandMuted)
                                        .tracking(0.3)
                                    Spacer()
                                    Text("\(Money.label(sale.totalRappen)) · \(sale.paymentMethodLabel)")
                                        .font(.headline)
                                        .foregroundColor(.brandAccent)
                                }
                                Text(sale.itemsSummary)
                                    .font(.subheadline)
                                    .foregroundColor(.brandInk)
                                    .lineLimit(2)
                            }
                            .padding(.vertical, 6)
                            .listRowBackground(Color.brandSurface)
                        }
                        .listStyle(.plain)
                        .refreshable { await viewModel.loadSales() }
                    }

                case .error(let message):
                    VStack(spacing: 16) {
                        Text(message)
                            .foregroundColor(.red)
                            .multilineTextAlignment(.center)
                            .padding()
                        Button("Retry") {
                            Task { await viewModel.loadSales() }
                        }
                        .buttonStyle(BrandOutlinedButtonStyle())
                    }
                }
            }
            .navigationTitle("Sales History")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Color.brandBackground, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.light, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    // Small, visible indicator that a DB/network sync runs.
                    if viewModel.isSyncing {
                        ProgressView()
                            .controlSize(.small)
                            .tint(.brandAccent)
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundColor(.brandInk)
                }
            }
            .task {
                viewModel.modelContext = modelContext
                await viewModel.loadSales()
            }
        }
        .accentColor(Color.brandInk)
    }
}
