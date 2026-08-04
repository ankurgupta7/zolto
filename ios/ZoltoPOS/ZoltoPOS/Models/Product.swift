import Foundation

struct Product: Codable, Identifiable, Hashable {
    let id: Int
    let name: String
    let nameEn: String?
    let price: String?
    let priceRappen: Int
    let category: String?
    let imageUrl: String?
    let imageKey: String?
    let quantity: Int
    // `description` is mapped from the JSON key of the same name but stored under
    // a different Swift name to avoid clashing with CustomStringConvertible.
    let productDescription: String?
    let descriptionEn: String?
    // Whether the product is listed on the storefront. Absent on older server
    // responses that only ever returned visible products anyway, so decoding
    // defaults to true.
    let visible: Bool

    enum CodingKeys: String, CodingKey {
        case id, name, nameEn, price, priceRappen, category, imageUrl, imageKey, quantity
        case productDescription = "description"
        case descriptionEn, visible
    }

    init(
        id: Int,
        name: String,
        nameEn: String?,
        price: String?,
        priceRappen: Int,
        category: String?,
        imageUrl: String?,
        imageKey: String?,
        quantity: Int,
        productDescription: String? = nil,
        descriptionEn: String? = nil,
        visible: Bool = true
    ) {
        self.id = id
        self.name = name
        self.nameEn = nameEn
        self.price = price
        self.priceRappen = priceRappen
        self.category = category
        self.imageUrl = imageUrl
        self.imageKey = imageKey
        self.quantity = quantity
        self.productDescription = productDescription
        self.descriptionEn = descriptionEn
        self.visible = visible
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(Int.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        nameEn = try container.decodeIfPresent(String.self, forKey: .nameEn)
        price = try container.decodeIfPresent(String.self, forKey: .price)
        priceRappen = try container.decode(Int.self, forKey: .priceRappen)
        category = try container.decodeIfPresent(String.self, forKey: .category)
        imageUrl = try container.decodeIfPresent(String.self, forKey: .imageUrl)
        imageKey = try container.decodeIfPresent(String.self, forKey: .imageKey)
        quantity = try container.decode(Int.self, forKey: .quantity)
        productDescription = try container.decodeIfPresent(String.self, forKey: .productDescription)
        descriptionEn = try container.decodeIfPresent(String.self, forKey: .descriptionEn)
        visible = try container.decodeIfPresent(Bool.self, forKey: .visible) ?? true
    }

    var displayName: String {
        if let nameEn = nameEn, !nameEn.trimmingCharacters(in: .whitespaces).isEmpty {
            return nameEn
        }
        return name
    }

    var priceChf: String {
        return String(format: "%.2f", Double(priceRappen) / 100.0)
    }

    /// Everything the unified search box matches against — name (both languages),
    /// category, description (both languages) and the formatted price.
    var searchableText: String {
        [name, nameEn, category, productDescription, descriptionEn, priceChf]
            .compactMap { $0 }
            .joined(separator: " ")
    }
}
