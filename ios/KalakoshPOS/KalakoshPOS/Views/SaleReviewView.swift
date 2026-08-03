import SwiftUI

struct SaleReviewView: View {
    @EnvironmentObject var viewModel: ProductViewModel
    @Environment(\.dismiss) var dismiss
    @State private var showingPayment = false
    @State private var selectedPaymentMethod = "card"

    @State private var overridingProduct: Product?
    @State private var overridePriceText: String = ""

    @State private var showingAddCustomItem = false
    @State private var customItemName: String = ""
    @State private var customItemPriceText: String = ""

    var body: some View {
        NavigationView {
            ZStack {
                Color.kalakoshWarmWhite.ignoresSafeArea()

                VStack(spacing: 0) {
                    List {
                        Section {
                            ForEach(viewModel.selectedProducts()) { product in
                                productRow(product)
                            }
                        }

                        if !viewModel.customItems.isEmpty {
                            Section("Custom Items") {
                                ForEach(viewModel.customItems) { item in
                                    customItemRow(item)
                                }
                            }
                        }

                        Section {
                            Button(action: {
                                customItemName = ""
                                customItemPriceText = ""
                                showingAddCustomItem = true
                            }) {
                                Label("Add Custom Item", systemImage: "plus.circle")
                                    .foregroundColor(.kalakoshForestGreen)
                            }
                        }
                        .listRowBackground(Color.kalakoshSoftIvory)
                    }
                    .listStyle(.plain)
                    .background(Color.kalakoshWarmWhite)

                    Divider()
                        .background(Color.kalakoshBorder)

                    VStack(spacing: 16) {
                        HStack {
                            Text("Total")
                                .font(.title3.weight(.bold))
                                .foregroundColor(.kalakoshDeepText)
                                .tracking(0.5)
                            Spacer()
                            Text("CHF \(viewModel.totalChf)")
                                .font(.title2.weight(.bold))
                                .foregroundColor(.kalakoshNearBlack)
                        }
                        .padding(.horizontal)
                        .padding(.top, 16)

                        HStack(spacing: 8) {
                            Button(action: { charge(method: "card") }) {
                                Text("Card")
                            }
                            .buttonStyle(KalakoshPrimaryButtonStyle())

                            Button(action: { charge(method: "cash") }) {
                                Text("Cash")
                            }
                            .buttonStyle(KalakoshOutlinedButtonStyle())

                            Button(action: { charge(method: "twint") }) {
                                Text("TWINT")
                            }
                            .buttonStyle(KalakoshOutlinedButtonStyle())
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 16)
                    }
                    .background(Color.kalakoshWarmWhite)
                }
            }
            .navigationTitle("Sale Review")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Color.kalakoshWarmWhite, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.light, for: .navigationBar)
            .navigationBarItems(leading: Button("Cancel") { dismiss() }
                .foregroundColor(.kalakoshNearBlack))
            .alert(
                "Override Price",
                isPresented: Binding(
                    get: { overridingProduct != nil },
                    set: { if !$0 { overridingProduct = nil } }
                ),
                presenting: overridingProduct
            ) { product in
                TextField("Price (CHF)", text: $overridePriceText)
                    .keyboardType(.decimalPad)
                Button("Reset to List Price", role: .destructive) {
                    viewModel.setPriceOverride(productId: product.id, priceRappen: nil)
                }
                Button("Save") {
                    if let rappen = Money.parseChfToRappen(overridePriceText) {
                        viewModel.setPriceOverride(productId: product.id, priceRappen: rappen)
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: { product in
                Text("Enter the bargained final price for \(product.displayName). List price is CHF \(product.priceChf).")
            }
            .alert("Add Custom Item", isPresented: $showingAddCustomItem) {
                TextField("Item name", text: $customItemName)
                TextField("Price (CHF)", text: $customItemPriceText)
                    .keyboardType(.decimalPad)
                Button("Add") {
                    let trimmedName = customItemName.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !trimmedName.isEmpty,
                          let rappen = Money.parseChfToRappen(customItemPriceText) else { return }
                    viewModel.addCustomItem(name: trimmedName, priceRappen: rappen)
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Sell an item that isn't in the catalogue.")
            }
            .fullScreenCover(isPresented: $showingPayment) {
                PaymentView(
                    productIds: Array(viewModel.selectedIds),
                    totalRappen: viewModel.totalRappen(),
                    allowHidden: viewModel.showHiddenItems,
                    paymentMethod: selectedPaymentMethod,
                    priceOverrides: Dictionary(
                        uniqueKeysWithValues: viewModel.priceOverrides.map { (String($0.key), $0.value) }
                    ),
                    customItems: viewModel.customItems.map {
                        CustomLineItemRequest(name: $0.name, priceRappen: $0.priceRappen)
                    }
                )
                    .environmentObject(viewModel)
            }
        }
        .accentColor(Color.kalakoshForestGreen)
    }

    // "card" drives the existing Stripe Terminal Tap to Pay flow. "cash" and
    // "twint" skip Stripe entirely — Tap to Pay can't collect either (no
    // contactless tap for cash, no QR display for TWINT) — so PaymentView
    // just records the sale directly once opened with that method.
    private func charge(method: String) {
        selectedPaymentMethod = method
        showingPayment = true
    }

    @ViewBuilder
    private func productRow(_ product: Product) -> some View {
        let chargedRappen = viewModel.chargedPriceRappen(for: product)
        let isOverridden = viewModel.priceOverrides[product.id] != nil

        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(product.displayName)
                    .font(.system(.subheadline, design: .default).weight(.semibold))
                    .foregroundColor(.kalakoshDeepText)
                if isOverridden {
                    HStack(spacing: 6) {
                        Text("CHF \(product.priceChf)")
                            .font(.footnote)
                            .strikethrough()
                            .foregroundColor(.kalakoshMutedText)
                        Text("CHF \(Money.chfString(chargedRappen))")
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(.kalakoshGold)
                    }
                } else {
                    Text("CHF \(product.priceChf)")
                        .font(.subheadline)
                        .foregroundColor(.kalakoshGold)
                }
            }
            Spacer()
            Button(action: {
                overridePriceText = Money.chfString(chargedRappen)
                overridingProduct = product
            }) {
                Text("Bargain")
                    .font(.footnote.weight(.medium))
                    .foregroundColor(.kalakoshNearBlack)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .overlay(
                        RoundedRectangle(cornerRadius: 4)
                            .stroke(Color.kalakoshNearBlack, lineWidth: 1)
                    )
            }
            .buttonStyle(.plain)
            Button(action: {
                viewModel.toggleSelection(productId: product.id)
                if viewModel.selectedIds.isEmpty && viewModel.customItems.isEmpty { dismiss() }
            }) {
                Text("Remove")
                    .font(.footnote.weight(.medium))
                    .foregroundColor(.kalakoshNearBlack)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .overlay(
                        RoundedRectangle(cornerRadius: 4)
                            .stroke(Color.kalakoshNearBlack, lineWidth: 1)
                    )
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 6)
        .listRowBackground(Color.kalakoshSoftWhite)
    }

    @ViewBuilder
    private func customItemRow(_ item: CustomLineItem) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(item.name)
                    .font(.system(.subheadline, design: .default).weight(.semibold))
                    .foregroundColor(.kalakoshDeepText)
                Text("CHF \(Money.chfString(item.priceRappen))")
                    .font(.subheadline)
                    .foregroundColor(.kalakoshGold)
            }
            Spacer()
            Button(action: {
                viewModel.removeCustomItem(id: item.id)
                if viewModel.selectedIds.isEmpty && viewModel.customItems.isEmpty { dismiss() }
            }) {
                Text("Remove")
                    .font(.footnote.weight(.medium))
                    .foregroundColor(.kalakoshNearBlack)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .overlay(
                        RoundedRectangle(cornerRadius: 4)
                            .stroke(Color.kalakoshNearBlack, lineWidth: 1)
                    )
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 6)
        .listRowBackground(Color.kalakoshSoftWhite)
    }
}

private extension Color {
    static let error = Color(red: 0.83, green: 0.18, blue: 0.18)
}
