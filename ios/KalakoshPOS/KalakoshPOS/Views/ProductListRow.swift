import SwiftUI

struct ProductListRow: View {
    let product: Product
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                // Thumbnail
                if let urlString = product.imageUrl, let url = URL(string: urlString) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image.resizable().aspectRatio(contentMode: .fill)
                        default:
                            Color.gray.opacity(0.1)
                        }
                    }
                    .frame(width: 50, height: 50)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                } else {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color.gray.opacity(0.1))
                        .frame(width: 50, height: 50)
                        .overlay(Image(systemName: "photo").foregroundColor(.gray))
                }
                
                VStack(alignment: .leading, spacing: 2) {
                    Text(product.displayName)
                        .font(.subheadline.weight(.medium))
                        .foregroundColor(.kalakoshNearBlack)
                        .lineLimit(1)
                    
                    Text(product.category ?? "Other")
                        .font(.caption2)
                        .foregroundColor(.kalakoshMutedText)
                }
                
                Spacer()
                
                VStack(alignment: .trailing, spacing: 2) {
                    Text("CHF \(product.priceChf)")
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.kalakoshForestGreen)
                    
                    if product.quantity > 1 {
                        Text("\(product.quantity) left")
                            .font(.system(size: 10, weight: .bold))
                            .padding(.horizontal, 4)
                            .padding(.vertical, 2)
                            .background(Color.kalakoshNearBlack.opacity(0.05))
                            .cornerRadius(4)
                    }
                }
                
                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.kalakoshForestGreen)
                        .font(.title3)
                } else {
                    Image(systemName: "circle")
                        .foregroundColor(.kalakoshNearBlack.opacity(0.1))
                        .font(.title3)
                }
            }
            .padding(.vertical, 8)
            .padding(.horizontal, 16)
            .background(isSelected ? Color.kalakoshForestGreen.opacity(0.05) : Color.clear)
        }
        .buttonStyle(PlainButtonStyle())
    }
}
