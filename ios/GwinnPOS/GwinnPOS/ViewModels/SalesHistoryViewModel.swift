import Foundation
import SwiftData

class SalesHistoryViewModel: ObservableObject {
    @Published var salesState: UiState<[SaleSummary]> = .idle
    // Small, visible "a DB/network op is running" flag for the UI.
    @Published var isSyncing: Bool = false
    var modelContext: ModelContext?

    @MainActor
    func loadSales() async {
        isSyncing = true
        defer { isSyncing = false }
        salesState = .loading
        do {
            let sales = try await ApiService.shared.getSalesHistory()
            self.salesState = .success(sales)
            
            // Cache for offline
            if let context = modelContext {
                try? context.delete(model: SaleModel.self)
                for sale in sales {
                    context.insert(SaleModel(sale: sale))
                }
                try? context.save()
            }
        } catch {
            // Try loading from cache
            if let context = modelContext {
                let descriptor = FetchDescriptor<SaleModel>(sortBy: [SortDescriptor(\.createdAt, order: .reverse)])
                if let cachedModels = try? context.fetch(descriptor), !cachedModels.isEmpty {
                    let cachedSales = cachedModels.map { $0.toSummary() }
                    self.salesState = .success(cachedSales)
                    return
                }
            }
            salesState = .error(error.localizedDescription)
        }
    }
}
