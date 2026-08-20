import SwiftUI
import SwiftData

struct MainView: View {
    @EnvironmentObject var viewModel: ProductViewModel
    @Environment(\.modelContext) private var modelContext
    @StateObject private var offlineManager = OfflinePaymentManager.shared
    @ObservedObject private var session = StoreSession.shared
    @State private var showingSalesHistory = false
    @State private var showingReview = false
    @State private var showingSettings = false
    @State private var showingAddCustomItem = false
    @State private var showingOfflineDetails = false
    @State private var customItemName: String = ""
    @State private var customItemPriceText: String = ""

    let columns = [GridItem(.adaptive(minimum: 160))]

    var body: some View {
        NavigationView {
            ZStack {
                Color.brandBackground.ignoresSafeArea()

                VStack(spacing: 0) {
                    // Offline status banner — shown when offline or pending syncs exist
                    if !offlineManager.isOnline || offlineManager.pendingCount > 0 {
                        OfflineStatusBar(
                            isOnline: offlineManager.isOnline,
                            pendingCount: offlineManager.pendingCount,
                            onTap: { showingOfflineDetails = true }
                        )
                    }

                    switch viewModel.productsState {
                    case .idle, .loading:
                        Spacer()
                        ProgressView()
                            .progressViewStyle(.circular)
                            .tint(.brandInk)
                        Text("Loading products…")
                            .font(.subheadline)
                            .foregroundColor(.brandMuted)
                            .padding(.top, 12)
                        Spacer()

                    case .success(let products):
                        if products.isEmpty {
                            Spacer()
                            Text("No products available")
                                .foregroundColor(.brandMuted)
                            Spacer()
                        } else {
                            // Category filter bar — shown only when there is more
                            // than one category (i.e. real, non-empty categories
                            // exist), mirroring the website which hides empties.
                            if viewModel.visibleCategories.count > 1 {
                                CategoryFilterBar(
                                    categories: viewModel.visibleCategories,
                                    selected: viewModel.selectedCategory
                                ) { category in
                                    viewModel.selectedCategory = category
                                }
                            }

                            DiscoveryControlBar(viewModel: viewModel)

                            if viewModel.filteredProducts.isEmpty {
                                Spacer()
                                Text("No pieces match your search")
                                    .foregroundColor(.brandMuted)
                                Spacer()
                            } else {
                                ScrollView {
                                    if viewModel.sortBy == .category && viewModel.searchQuery.isEmpty {
                                        VStack(spacing: 0) {
                                            ForEach(viewModel.visibleCategories.filter { $0 != CategoryFilter.all }, id: \.self) { category in
                                                let categoryProducts = viewModel.filteredProducts.filter { $0.category == category }
                                                if !categoryProducts.isEmpty {
                                                    DisclosureGroup(
                                                        isExpanded: Binding(
                                                            get: { viewModel.expandedCategories.contains(category) },
                                                            set: { isExpanded in
                                                                if isExpanded {
                                                                    viewModel.expandedCategories.insert(category)
                                                                } else {
                                                                    viewModel.expandedCategories.remove(category)
                                                                }
                                                            }
                                                        )
                                                    ) {
                                                        ProductGridOrList(products: categoryProducts)
                                                            .padding(.top, 8)
                                                    } label: {
                                                        HStack {
                                                            Text(category)
                                                                .font(.headline)
                                                                .foregroundColor(.brandInk)
                                                            Spacer()
                                                            Text("\(categoryProducts.count)")
                                                                .font(.subheadline)
                                                                .foregroundColor(.brandMuted)
                                                        }
                                                        .padding(.vertical, 12)
                                                    }
                                                    .padding(.horizontal, 16)
                                                    Divider()
                                                        .padding(.horizontal, 16)
                                                }
                                            }
                                        }
                                    } else {
                                        ProductGridOrList(products: viewModel.filteredProducts)
                                    }
                                }
                                .refreshable { await viewModel.loadProducts() }
                            }
                        }

                    case .error(let message):
                        Spacer()
                        Text(message)
                            .foregroundColor(.red)
                            .multilineTextAlignment(.center)
                            .padding()
                        Button("Retry") {
                            Task { await viewModel.loadProducts() }
                        }
                        .buttonStyle(BrandOutlinedButtonStyle())
                        .padding(.horizontal, 40)
                        Button("Pairing & settings") {
                            showingSettings = true
                        }
                        .buttonStyle(BrandOutlinedButtonStyle())
                        .padding(.horizontal, 40)
                        .padding(.top, 8)
                        Spacer()
                    }
                }

                VStack {
                    Spacer()
                    if !viewModel.selectedIds.isEmpty || !viewModel.customItems.isEmpty {
                        Button(action: { showingReview = true }) {
                            HStack {
                                Text("\(viewModel.selectedIds.count + viewModel.customItems.count) item(s) — \(Money.label(viewModel.totalRappen()))")
                                    .fontWeight(.semibold)
                                Spacer()
                                Text("Review Sale")
                                    .fontWeight(.semibold)
                                Image(systemName: "chevron.right")
                                    .font(.caption.weight(.bold))
                            }
                            .padding(.horizontal, 20)
                        }
                        .buttonStyle(BrandPrimaryButtonStyle())
                        .padding(16)
                        .shadow(color: .black.opacity(0.15), radius: 8, x: 0, y: -2)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                }
                .animation(
                    .spring(response: 0.3, dampingFraction: 0.8),
                    value: viewModel.selectedIds.isEmpty && viewModel.customItems.isEmpty
                )
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    // The paired store's own branding, fetched at runtime —
                    // logo when the merchant uploaded one, name otherwise,
                    // neutral app name until a store is paired.
                    if let logoUrl = session.identity?.logoUrl, let url = URL(string: logoUrl) {
                        AsyncImage(url: url) { phase in
                            switch phase {
                            case .success(let image):
                                image
                                    .resizable()
                                    .scaledToFit()
                                    .frame(height: 28)
                            default:
                                storeNameTitle
                            }
                        }
                    } else {
                        storeNameTitle
                    }
                }
                ToolbarItem(placement: .navigationBarLeading) {
                    HStack(spacing: 8) {
                        Button(action: { showingSettings = true }) {
                            Image(systemName: "gear")
                                .foregroundColor(.brandInk)
                        }
                        // Small, visible indicator that a DB/network sync runs.
                        if viewModel.isSyncing {
                            ProgressView()
                                .controlSize(.small)
                                .tint(.brandAccent)
                        }
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    HStack(spacing: 8) {
                        // Cashier override to browse/sell products hidden from the
                        // storefront. Deliberately not persisted (see
                        // ProductViewModel.showHiddenItems), so it must be
                        // re-enabled every session, mirroring Android.
                        Menu {
                            Toggle("Show Hidden Items", isOn: Binding(
                                get: { viewModel.showHiddenItems },
                                set: { newValue in
                                    viewModel.showHiddenItems = newValue
                                    Task { await viewModel.loadProducts() }
                                }
                            ))
                        } label: {
                            Image(systemName: viewModel.showHiddenItems ? "eye.fill" : "eye")
                                .foregroundColor(.brandInk)
                        }
                        Button(action: { showingSalesHistory = true }) {
                            Image(systemName: "clock.arrow.circlepath")
                                .foregroundColor(.brandInk)
                        }
                        // Sells something outside the catalogue entirely — the only
                        // entry point that doesn't require selecting a product first.
                        Button(action: {
                            customItemName = ""
                            customItemPriceText = ""
                            showingAddCustomItem = true
                        }) {
                            Image(systemName: "plus.circle")
                                .foregroundColor(.brandInk)
                        }
                    }
                }
            }
            .searchable(
                text: $viewModel.searchQuery,
                placement: .navigationBarDrawer(displayMode: .always),
                prompt: "Search name, category, price…"
            )
            .toolbarBackground(Color.brandBackground, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.light, for: .navigationBar)
            .sheet(isPresented: $showingSalesHistory) {
                SalesHistoryView()
            }
            .sheet(isPresented: $showingReview) {
                SaleReviewView()
                    .environmentObject(viewModel)
            }
            .sheet(isPresented: $showingSettings) {
                SettingsView()
                    .onDisappear {
                        Task { await viewModel.loadProducts() }
                    }
            }
            .sheet(isPresented: $showingOfflineDetails) {
                OfflineDetailsView()
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
            .task {
                viewModel.modelContext = modelContext
                OfflinePaymentManager.shared.configure(with: modelContext)
                if session.isPaired {
                    await session.refreshIdentity()
                    await viewModel.loadProducts()
                }
            }
        }
        .accentColor(Color.brandInk)
        // Pairing is a hard gate, not a sheet the cashier can swipe away:
        // covers first run, explicit unpair, and a rotated/revoked key (401).
        .fullScreenCover(isPresented: Binding(
            get: { !session.isPaired },
            set: { _ in }
        )) {
            PairingView {
                Task { await viewModel.loadProducts() }
            }
        }
    }

    private var storeNameTitle: some View {
        let name = session.identity?.storeName ?? ""
        return Text((name.isEmpty ? "Gwinn POS" : name).uppercased())
            .font(.system(.headline, design: .default).weight(.bold))
            .tracking(3)
            .foregroundColor(.brandInk)
            .lineLimit(1)
    }
}

// MARK: - Offline Status Bar

/// A compact banner shown at the top of the product grid when the device is
/// offline or has pending transactions to sync.
struct OfflineStatusBar: View {
    let isOnline: Bool
    let pendingCount: Int
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 6) {
                Image(systemName: isOnline ? "checkmark.circle.fill" : "wifi.slash")
                    .font(.caption2)
                if !isOnline {
                    Text("Offline — Cash sales only")
                        .font(.caption.weight(.medium))
                }
                if pendingCount > 0 {
                    Text("\(pendingCount) pending sync")
                        .font(.caption.weight(.semibold))
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption2)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .foregroundColor(isOnline ? .white : .white)
            .background(isOnline ? Color.brandInk : Color.orange)
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - Offline Details Sheet

/// A detail sheet showing pending transactions and a manual sync button.
struct OfflineDetailsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @StateObject private var offlineManager = OfflinePaymentManager.shared
    @State private var pendingTransactions: [PendingTransactionModel] = []

    var body: some View {
        NavigationView {
            List {
                Section {
                    HStack {
                        Image(systemName: offlineManager.isOnline ? "wifi" : "wifi.slash")
                        Text(offlineManager.isOnline ? "Connected" : "Offline")
                            .fontWeight(.medium)
                        Spacer()
                        if !offlineManager.isOnline {
                            Text("Cash sales only")
                                .font(.caption)
                                .foregroundColor(.orange)
                        }
                    }

                    if offlineManager.pendingCount > 0 {
                        Button {
                            Task {
                                await offlineManager.syncAllPending()
                            }
                        } label: {
                            HStack {
                                Image(systemName: "arrow.clockwise.circle.fill")
                                Text("Sync Now (\(offlineManager.pendingCount) pending)")
                            }
                        }
                    }
                }

                if pendingTransactions.isEmpty {
                    Section {
                        Text("No pending transactions")
                            .foregroundColor(.secondary)
                    }
                } else {
                    Section("Pending Transactions") {
                        ForEach(pendingTransactions) { tx in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(tx.displayLabel)
                                    .font(.subheadline.weight(.medium))
                                HStack {
                                    Text(Money.label(tx.totalRappen))
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                    Spacer()
                                    StatusBadge(status: tx.status)
                                }
                                if let error = tx.lastError {
                                    Text(error)
                                        .font(.caption2)
                                        .foregroundColor(.red)
                                        .lineLimit(2)
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }
            }
            .navigationTitle("Offline Status")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .task { await loadPending() }
    }

    /// Fetches pending and failed transactions manually — @Query with a
    /// compound #Predicate triggers a Swift type-checker timeout in release
    /// builds, so we use modelContext.fetch() directly.
    private func loadPending() async {
        let descriptor = FetchDescriptor<PendingTransactionModel>(
            predicate: #Predicate<PendingTransactionModel> { tx in
                tx.status == "pending" || tx.status == "failed"
            },
            sortBy: [SortDescriptor(\.createdAt)]
        )
        pendingTransactions = (try? modelContext.fetch(descriptor)) ?? []
    }
}

struct StatusBadge: View {
    let status: String

    var body: some View {
        Text(status.uppercased())
            .font(.system(size: 9, weight: .bold))
            .tracking(0.5)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(backgroundColor)
            .foregroundColor(.white)
            .cornerRadius(4)
    }

    private var backgroundColor: Color {
        switch status {
        case "pending": return .orange
        case "syncing": return .blue
        case "failed": return .red
        case "synced": return Color.brandInk
        default: return .gray
        }
    }
}

// MARK: - Category Filter Bar

/// Horizontal, single-select category filter chips shown above the product grid.
struct CategoryFilterBar: View {
    let categories: [String]
    let selected: String
    let onSelect: (String) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(categories, id: \.self) { category in
                    CategoryChip(label: category, isSelected: category == selected) {
                        onSelect(category)
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .background(Color.brandBackground)
    }
}

struct CategoryChip: View {
    let label: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.system(.caption, design: .default).weight(.semibold))
                .tracking(0.5)
                .textCase(.uppercase)
                .foregroundColor(isSelected ? .brandAccent : .brandInk)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(isSelected ? Color.brandInk : Color.brandSurface)
                .overlay(
                    RoundedRectangle(cornerRadius: 4)
                        .stroke(isSelected ? Color.brandAccent : Color.brandBorder, lineWidth: 1)
                )
                .cornerRadius(4)
        }
        .buttonStyle(PlainButtonStyle())
    }
}

struct ProductCard: View {
    let product: Product
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 0) {
                ZStack(alignment: .bottomTrailing) {
                    if let imageUrl = product.imageUrl, let url = URL(string: imageUrl) {
                        AsyncImage(url: url) { image in
                            image.resizable().scaledToFill()
                        } placeholder: {
                            Color.brandBorder
                                .overlay(Image(systemName: "photo").foregroundColor(.brandMuted))
                        }
                        .frame(height: 140)
                        .clipped()
                    } else {
                        Color.brandBorder
                            .overlay(Image(systemName: "photo").foregroundColor(.brandMuted))
                            .frame(height: 140)
                    }

                    if isSelected {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 22))
                            .foregroundColor(.brandAccent)
                            .shadow(color: .black.opacity(0.25), radius: 2)
                            .padding(8)
                    }

                    if !product.visible {
                        Text("Hidden")
                            .font(.system(size: 10, weight: .bold))
                            .tracking(0.5)
                            .textCase(.uppercase)
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(Color.red)
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                            .padding(6)
                    }

                    if product.quantity > 1 {
                        Text("\(product.quantity)")
                            .font(.system(size: 10, weight: .bold))
                            .tracking(0.5)
                            .foregroundColor(.brandInk)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(Color.brandAccent)
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                            .padding(6)
                    }
                }

                VStack(alignment: .leading, spacing: 3) {
                    Text(product.displayName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.brandInk)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                        // Two lines' worth of box whether or not the name
                        // wraps, so prices sit on one line across a row.
                        .frame(minHeight: 38, alignment: .topLeading)

                    Text(Money.label(product.priceRappen))
                        .font(.footnote)
                        .foregroundColor(.brandAccent)
                }
                .padding(10)
            }
            .background(Color.brandSurface)
            .cornerRadius(4)
            .overlay(
                RoundedRectangle(cornerRadius: 4)
                    .stroke(isSelected ? Color.brandAccent : Color.brandBorder, lineWidth: isSelected ? 2 : 1)
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - ProductGridOrList

struct ProductGridOrList: View {
    let products: [Product]
    @EnvironmentObject var viewModel: ProductViewModel

    let columns = [GridItem(.adaptive(minimum: 160), spacing: 12)]

    var body: some View {
        if viewModel.viewMode == .grid {
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(products) { product in
                    ProductCard(
                        product: product,
                        isSelected: viewModel.selectedIds.contains(product.id)
                    ) {
                        viewModel.toggleSelection(productId: product.id)
                    }
                }
            }
            .padding(12)
        } else {
            // Deliberately full-bleed and un-inset: side padding, a card
            // inset and a corner radius all cost width the product name
            // needs, and the name is the thing being read.
            LazyVStack(spacing: 0) {
                ForEach(products) { product in
                    ProductListRow(
                        product: product,
                        isSelected: viewModel.selectedIds.contains(product.id)
                    ) {
                        viewModel.toggleSelection(productId: product.id)
                    }
                    if product != products.last {
                        Divider()
                            .padding(.leading, ProductListRow.textInset)
                    }
                }
            }
            .background(Color.white)
        }
    }
}
