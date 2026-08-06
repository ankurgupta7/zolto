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
                Color.zoltoBackground.ignoresSafeArea()

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
                                    .foregroundColor(.zoltoInk)
                            }
                        }
                        .listRowBackground(Color.zoltoSurface)
                    }
                    .listStyle(.plain)
                    .background(Color.zoltoBackground)

                    Divider()
                        .background(Color.zoltoBorder)

                    VStack(spacing: 16) {
                        HStack {
                            Text("Total")
                                .font(.title3.weight(.bold))
                                .foregroundColor(.zoltoInk)
                                .tracking(0.5)
                            Spacer()
                            Text(Money.label(viewModel.totalRappen()))
                                .font(.title2.weight(.bold))
                                .foregroundColor(.zoltoInk)
                        }
                        .padding(.horizontal)
                        .padding(.top, 16)

                        HStack(spacing: 8) {
                            Button(action: { charge(method: "card") }) {
                                Text("Card")
                            }
                            .buttonStyle(ZoltoPrimaryButtonStyle())

                            Button(action: { charge(method: "cash") }) {
                                Text("Cash")
                            }
                            .buttonStyle(ZoltoOutlinedButtonStyle())

                            Button(action: { charge(method: "twint") }) {
                                Text("TWINT")
                            }
                            .buttonStyle(ZoltoOutlinedButtonStyle())
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 16)
                    }
                    .background(Color.zoltoBackground)
                }
            }
            .navigationTitle("Sale Review")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Color.zoltoBackground, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.light, for: .navigationBar)
            .navigationBarItems(leading: Button("Cancel") { dismiss() }
                .foregroundColor(.zoltoInk))
            .alert(
                "Override Price",
                isPresented: Binding(
                    get: { overridingProduct != nil },
                    set: { if !$0 { overridingProduct = nil } }
                ),
                presenting: overridingProduct
            ) { product in
                TextField("Price (\(Money.displayCurrency))", text: $overridePriceText)
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
                Text("Enter the bargained final price for \(product.displayName). List price is \(Money.label(product.priceRappen)).")
            }
            .alert("Add Custom Item", isPresented: $showingAddCustomItem) {
                TextField("Item name", text: $customItemName)
                TextField("Price (\(Money.displayCurrency))", text: $customItemPriceText)
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
        .accentColor(Color.zoltoInk)
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
                    .foregroundColor(.zoltoInk)
                if isOverridden {
                    HStack(spacing: 6) {
                        Text(Money.label(product.priceRappen))
                            .font(.footnote)
                            .strikethrough()
                            .foregroundColor(.zoltoMuted)
                        Text(Money.label(chargedRappen))
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(.zoltoAccent)
                    }
                } else {
                    Text(Money.label(product.priceRappen))
                        .font(.subheadline)
                        .foregroundColor(.zoltoAccent)
                }
            }
            Spacer()
            Button(action: {
                overridePriceText = Money.chfString(chargedRappen)
                overridingProduct = product
            }) {
                Text("Bargain")
                    .font(.footnote.weight(.medium))
                    .foregroundColor(.zoltoInk)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .overlay(
                        RoundedRectangle(cornerRadius: 4)
                            .stroke(Color.zoltoInk, lineWidth: 1)
                    )
            }
            .buttonStyle(.plain)
            Button(action: {
                viewModel.toggleSelection(productId: product.id)
                if viewModel.selectedIds.isEmpty && viewModel.customItems.isEmpty { dismiss() }
            }) {
                Text("Remove")
                    .font(.footnote.weight(.medium))
                    .foregroundColor(.zoltoInk)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .overlay(
                        RoundedRectangle(cornerRadius: 4)
                            .stroke(Color.zoltoInk, lineWidth: 1)
                    )
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 6)
        .listRowBackground(Color.zoltoSurface)
    }

    @ViewBuilder
    private func customItemRow(_ item: CustomLineItem) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(item.name)
                    .font(.system(.subheadline, design: .default).weight(.semibold))
                    .foregroundColor(.zoltoInk)
                Text(Money.label(item.priceRappen))
                    .font(.subheadline)
                    .foregroundColor(.zoltoAccent)
            }
            Spacer()
            Button(action: {
                viewModel.removeCustomItem(id: item.id)
                if viewModel.selectedIds.isEmpty && viewModel.customItems.isEmpty { dismiss() }
            }) {
                Text("Remove")
                    .font(.footnote.weight(.medium))
                    .foregroundColor(.zoltoInk)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .overlay(
                        RoundedRectangle(cornerRadius: 4)
                            .stroke(Color.zoltoInk, lineWidth: 1)
                    )
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 6)
        .listRowBackground(Color.zoltoSurface)
    }
}

private extension Color {
    static let error = Color(red: 0.83, green: 0.18, blue: 0.18)
}
