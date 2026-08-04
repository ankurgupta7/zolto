import SwiftUI

struct SalesHistoryView: View {
    @StateObject private var viewModel = SalesHistoryViewModel()
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationView {
            ZStack {
                Color.zoltoWarmWhite.ignoresSafeArea()

                switch viewModel.salesState {
                case .idle, .loading:
                    ProgressView()
                        .progressViewStyle(.circular)
                        .tint(.zoltoNearBlack)

                case .success(let sales):
                    if sales.isEmpty {
                        Text("No sales recorded yet")
                            .foregroundColor(.zoltoMutedText)
                    } else {
                        List(sales) { sale in
                            VStack(alignment: .leading, spacing: 5) {
                                HStack {
                                    Text(sale.createdAt)
                                        .font(.caption)
                                        .foregroundColor(.zoltoMutedText)
                                        .tracking(0.3)
                                    Spacer()
                                    Text("CHF \(sale.totalChf) · \(sale.paymentMethodLabel)")
                                        .font(.headline)
                                        .foregroundColor(.zoltoGold)
                                }
                                Text(sale.itemsSummary)
                                    .font(.subheadline)
                                    .foregroundColor(.zoltoDeepText)
                                    .lineLimit(2)
                            }
                            .padding(.vertical, 6)
                            .listRowBackground(Color.zoltoSoftWhite)
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
            .toolbarBackground(Color.zoltoWarmWhite, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.light, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    // Small, visible indicator that a DB/network sync runs.
                    if viewModel.isSyncing {
                        ProgressView()
                            .controlSize(.small)
                            .tint(.zoltoGold)
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundColor(.zoltoNearBlack)
                }
            }
            .task {
                viewModel.modelContext = modelContext
                await viewModel.loadSales()
            }
        }
        .accentColor(Color.zoltoForestGreen)
    }
}
