import Foundation
import Combine
import SwiftData

enum UiState<T> {
    case idle
    case loading
    case success(T)
    case error(String)
}

/// A line item sold outside the catalogue (e.g. a one-off repair or a piece
/// not tracked in inventory). Carries no product id — the backend records it
/// by name instead.
struct CustomLineItem: Identifiable, Hashable {
    let id = UUID()
    var name: String
    var priceRappen: Int
}

class ProductViewModel: ObservableObject {
    enum SortMode: String, CaseIterable, Identifiable {
        case newest = "Newest"
        case category = "Category"
        case name = "Name"
        var id: String { self.rawValue }
    }

    enum ViewMode: String, CaseIterable, Identifiable {
        case grid = "Grid"
        case list = "List"
        var id: String { self.rawValue }
    }

    @Published var productsState: UiState<[Product]> = .idle
    @Published var selectedIds: Set<Int> = []
    @Published var sortBy: SortMode = .newest
    @Published var viewMode: ViewMode = .grid
    @Published var expandedCategories: Set<String> = []

    // Category filtering. "All" plus only the non-empty categories, in the
    // canonical order supplied by the website (single source of truth).
    @Published var selectedCategory: String = CategoryFilter.all
    @Published var visibleCategories: [String] = [CategoryFilter.all]

    // The unified search query and a small, visible "a DB/network op is running"
    // flag for the UI.
    @Published var searchQuery: String = ""
    @Published var isSyncing: Bool = false

    // Cashier override to browse/sell products hidden from the storefront.
    // Deliberately not persisted, so it resets to false on every app restart —
    // a cashier must consciously re-enable it each session.
    @Published var showHiddenItems: Bool = false

    // Bargained final price per product, in Rappen, keyed by product id. Only
    // products the cashier has actually overridden from list price appear
    // here — everything else charges at its normal priceRappen.
    @Published var priceOverrides: [Int: Int] = [:]

    // Items being sold outside the catalogue entirely (no product row).
    @Published var customItems: [CustomLineItem] = []

    // --- Offline status (observed by the UI for indicator badges) ---
    @Published var isOnline: Bool = true
    @Published var pendingSyncCount: Int = 0

    private var allProducts: [Product] = []
    private var canonicalCategories: [String] = []
    private var extraIncludes: [String: [String]] = [:]
    var modelContext: ModelContext?
    private var cancellables = Set<AnyCancellable>()

    /// Products after applying the search query + selected-category filter.
    /// A non-blank query searches the whole catalog across categories.
    var filteredProducts: [Product] {
        let base = ProductQuery.apply(
            allProducts,
            categoryOf: { $0.category },
            searchableTextOf: { $0.searchableText },
            category: selectedCategory,
            query: searchQuery,
            extraIncludes: extraIncludes
        )
        
        switch sortBy {
        case .newest:
            return base.sorted { $0.id > $1.id }
        case .category:
            return base.sorted { 
                let catA = $0.category ?? ""
                let catB = $1.category ?? ""
                if catA != catB { return catA < catB }
                return $0.displayName < $1.displayName
            }
        case .name:
            return base.sorted { $0.displayName < $1.displayName }
        }
    }

    @MainActor
    init() {
        // Observe connectivity and pending sync from the shared manager.
        // Must be @MainActor because OfflinePaymentManager is @MainActor
        // and its @Published publishers are isolated to the main actor.
        OfflinePaymentManager.shared.$isOnline
            .receive(on: DispatchQueue.main)
            .sink { [weak self] online in self?.isOnline = online }
            .store(in: &cancellables)

        OfflinePaymentManager.shared.$pendingCount
            .receive(on: DispatchQueue.main)
            .sink { [weak self] count in self?.pendingSyncCount = count }
            .store(in: &cancellables)
    }

    /// Loads products cache-first: cached products are shown immediately so the
    /// grid never blanks on refresh, while the network fetch runs in the
    /// background. The full-screen spinner appears only when nothing is cached.
    /// `isSyncing` stays true for the whole read/fetch/write cycle.
    @MainActor
    func loadProducts() async {
        isSyncing = true
        defer { isSyncing = false }

        // 1. Show cache immediately if nothing is on screen yet.
        if case .success = productsState {} else {
            let cached = cachedProducts()
            if cached.isEmpty {
                productsState = .loading
            } else {
                self.allProducts = cached
                productsState = .success(cached)
                refreshVisibleCategories(from: cached)
            }
        }

        // 2. Refresh the canonical category config (best-effort).
        if let cats = try? await ApiService.shared.getCategories() {
            canonicalCategories = cats.categories
            extraIncludes = cats.extraIncludes
        }

        // 3. Fetch the live catalogue and refresh the offline cache.
        do {
            let products = try await ApiService.shared.getProducts(includeHidden: showHiddenItems)
            self.allProducts = products
            self.productsState = .success(products)
            refreshVisibleCategories(from: products)

            if let context = modelContext {
                try? context.delete(model: ProductModel.self)
                for product in products {
                    context.insert(ProductModel(product: product))
                }
                try? context.save()
            }

            // Remove any selected products that are no longer available
            let availableIds = Set(products.map { $0.id })
            selectedIds = selectedIds.intersection(availableIds)
            priceOverrides = priceOverrides.filter { selectedIds.contains($0.key) }
        } catch {
            // Network failed. Keep showing cache if we already have it; else the
            // cache we may not have shown yet; else surface the error.
            if case .success = productsState { return }
            let cached = cachedProducts()
            if !cached.isEmpty {
                self.allProducts = cached
                self.productsState = .success(cached)
                refreshVisibleCategories(from: cached)
            } else {
                productsState = .error(error.localizedDescription)
            }
        }
    }

    private func cachedProducts() -> [Product] {
        guard let context = modelContext else { return [] }
        let descriptor = FetchDescriptor<ProductModel>()
        return (try? context.fetch(descriptor))?.map { $0.toProduct() } ?? []
    }

    /// Recomputes the chip list from the products just loaded and drops the
    /// active filter back to "All" if its category no longer has any products.
    private func refreshVisibleCategories(from products: [Product]) {
        let present = Set(products.compactMap { $0.category })
        visibleCategories = CategoryFilter.visibleCategories(
            canonicalOrder: canonicalCategories,
            present: present
        )
        if !visibleCategories.contains(selectedCategory) {
            selectedCategory = CategoryFilter.all
        }
    }
    
    func toggleSelection(productId: Int) {
        if selectedIds.contains(productId) {
            selectedIds.remove(productId)
            priceOverrides.removeValue(forKey: productId)
        } else {
            selectedIds.insert(productId)
        }
    }

    func clearSelection() {
        selectedIds.removeAll()
        priceOverrides.removeAll()
        customItems.removeAll()
    }

    func selectedProducts() -> [Product] {
        return allProducts.filter { selectedIds.contains($0.id) }
    }

    /// The price actually charged for a selected product: its bargained
    /// override if the cashier set one, otherwise its list price.
    func chargedPriceRappen(for product: Product) -> Int {
        priceOverrides[product.id] ?? product.priceRappen
    }

    /// Sets (or, when `nil`, clears) the bargained override for a product.
    func setPriceOverride(productId: Int, priceRappen: Int?) {
        if let priceRappen = priceRappen {
            priceOverrides[productId] = priceRappen
        } else {
            priceOverrides.removeValue(forKey: productId)
        }
    }

    func addCustomItem(name: String, priceRappen: Int) {
        customItems.append(CustomLineItem(name: name, priceRappen: priceRappen))
    }

    func removeCustomItem(id: UUID) {
        customItems.removeAll { $0.id == id }
    }

    func totalRappen() -> Int {
        let productsTotal = selectedProducts().reduce(0) { $0 + chargedPriceRappen(for: $1) }
        let customTotal = customItems.reduce(0) { $0 + $1.priceRappen }
        return productsTotal + customTotal
    }

    var totalChf: String {
        return String(format: "%.2f", Double(totalRappen()) / 100.0)
    }
}
