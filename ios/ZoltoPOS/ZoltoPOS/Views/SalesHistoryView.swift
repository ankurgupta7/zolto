import SwiftUI

struct SalesHistoryView: View {
    @StateObject private var viewModel = SalesHistoryViewModel()
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationView {
            ZStack {
                Color.zoltoBackground.ignoresSafeArea()

                switch viewModel.salesState {
                case .idle, .loading:
                    ProgressView()
                        .progressViewStyle(.circular)
                        .tint(.zoltoInk)

                case .success(let sales):
                    if sales.isEmpty {
                        Text("No sales recorded yet")
                            .foregroundColor(.zoltoMuted)
                    } else {
                        List(sales) { sale in
                            VStack(alignment: .leading, spacing: 5) {
                                HStack {
                                    Text(sale.createdAt)
                                        .font(.caption)
                                        .foregroundColor(.zoltoMuted)
                                        .tracking(0.3)
                                    Spacer()
                                    Text("\(Money.label(sale.totalRappen)) · \(sale.paymentMethodLabel)")
                                        .font(.headline)
                                        .foregroundColor(.zoltoAccent)
                                }
                                Text(sale.itemsSummary)
                                    .font(.subheadline)
                                    .foregroundColor(.zoltoInk)
                                    .lineLimit(2)
                            }
                            .padding(.vertical, 6)
                            .listRowBackground(Color.zoltoSurface)
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
                        .buttonStyle(ZoltoOutlinedButtonStyle())
                    }
                }
            }
            .navigationTitle("Sales History")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Color.zoltoBackground, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.light, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    // Small, visible indicator that a DB/network sync runs.
                    if viewModel.isSyncing {
                        ProgressView()
                            .controlSize(.small)
                            .tint(.zoltoAccent)
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundColor(.zoltoInk)
                }
            }
            .task {
                viewModel.modelContext = modelContext
                await viewModel.loadSales()
            }
        }
        .accentColor(Color.zoltoInk)
    }
}
