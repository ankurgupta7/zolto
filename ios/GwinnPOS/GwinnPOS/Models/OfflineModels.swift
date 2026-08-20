import Foundation
import SwiftData

@Model
class ProductModel {
    @Attribute(.unique) var id: Int
    var name: String
    var nameEn: String?
    var price: String?
    var priceRappen: Int
    var category: String?
    var imageUrl: String?
    var imageKey: String?
    var quantity: Int
    // New optional attributes — SwiftData performs a lightweight migration, so
    // existing caches simply back-fill these as nil.
    var productDescription: String?
    var descriptionEn: String?
    // New attribute — existing caches back-fill to true, matching Product's
    // own decode default (older cached rows were always visible anyway).
    var visible: Bool = true

    init(product: Product) {
        self.id = product.id
        self.name = product.name
        self.nameEn = product.nameEn
        self.price = product.price
        self.priceRappen = product.priceRappen
        self.category = product.category
        self.imageUrl = product.imageUrl
        self.imageKey = product.imageKey
        self.quantity = product.quantity
        self.productDescription = product.productDescription
        self.descriptionEn = product.descriptionEn
        self.visible = product.visible
    }

    func toProduct() -> Product {
        return Product(
            id: id,
            name: name,
            nameEn: nameEn,
            price: price,
            priceRappen: priceRappen,
            category: category,
            imageUrl: imageUrl,
            imageKey: imageKey,
            quantity: quantity,
            productDescription: productDescription,
            descriptionEn: descriptionEn,
            visible: visible
        )
    }
}

@Model
class SaleModel {
    @Attribute(.unique) var id: Int
    var totalRappen: Int
    // New attribute — existing caches back-fill to "card" (they were always
    // card sales before cash/TWINT existed), matching SwiftData's lightweight
    // migration for a new non-optional attribute with a default.
    var paymentMethod: String = "card"
    var createdAt: String
    var itemsJson: String

    init(sale: SaleSummary) {
        self.id = sale.id
        self.totalRappen = sale.totalRappen
        self.paymentMethod = sale.paymentMethod ?? "card"
        self.createdAt = sale.createdAt

        let encoder = JSONEncoder()
        if let data = try? encoder.encode(sale.items),
           let json = String(data: data, encoding: .utf8) {
            self.itemsJson = json
        } else {
            self.itemsJson = "[]"
        }
    }

    func toSummary() -> SaleSummary {
        let decoder = JSONDecoder()
        let items = (try? decoder.decode([SaleItem].self, from: itemsJson.data(using: .utf8) ?? Data())) ?? []
        return SaleSummary(
            id: id,
            totalRappen: totalRappen,
            paymentMethod: paymentMethod,
            createdAt: createdAt,
            items: items
        )
    }
}
