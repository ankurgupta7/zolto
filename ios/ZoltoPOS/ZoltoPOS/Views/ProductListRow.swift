import SwiftUI

/// One product in the picker.
///
/// The name owns the full width of the row and is allowed to wrap onto a
/// second line — a cashier scanning for "Moonstone pendant, 45cm chain" has to
/// be able to read which piece they are about to tap, and the old single-line
/// row clipped everything past about twenty characters. Price, stock and
/// visibility sit on a quieter metadata line underneath instead of competing
/// with the name for horizontal space.
struct ProductListRow: View {
    let product: Product
    let isSelected: Bool
    let action: () -> Void

    /// Large enough to stay legible next to a two-line name, small enough that
    /// a screenful still shows six or seven products.
    private let thumbnailSize: CGFloat = 56

    /// Where a divider drawn under this row should start, so it lines up with
    /// the name rather than cutting under the thumbnail.
    static let textInset: CGFloat = 16 + 56 + 14

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                thumbnail

                VStack(alignment: .leading, spacing: 4) {
                    Text(product.displayName)
                        .font(.body.weight(.semibold))
                        .foregroundColor(.zoltoInk)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                        // Without this a wrapped name is laid out in a
                        // single-line box and the second line is clipped.
                        .fixedSize(horizontal: false, vertical: true)

                    metadataLine
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                selectionIndicator
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(minHeight: 76)
            // The whole row is the target, not just the ink inside it.
            .contentShape(Rectangle())
            .background(isSelected ? Color.zoltoAccent.opacity(0.08) : Color.clear)
        }
        .buttonStyle(PlainButtonStyle())
        .accessibilityLabel(Text(product.displayName))
        .accessibilityValue(Text(Money.label(product.priceRappen)))
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : [.isButton])
    }

    @ViewBuilder
    private var thumbnail: some View {
        Group {
            if let urlString = product.imageUrl, let url = URL(string: urlString) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().aspectRatio(contentMode: .fill)
                    default:
                        placeholderFill
                    }
                }
            } else {
                placeholderFill
            }
        }
        .frame(width: thumbnailSize, height: thumbnailSize)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Color.zoltoBorder, lineWidth: 1)
        )
    }

    private var placeholderFill: some View {
        Color.zoltoSurface
            .overlay(
                Image(systemName: "photo")
                    .foregroundColor(.zoltoMuted)
            )
    }

    /// Price first — it is what the cashier reads next after the name — then
    /// only the facts that are unusual enough to be worth the space.
    private var metadataLine: some View {
        HStack(spacing: 8) {
            Text(Money.label(product.priceRappen))
                .font(.subheadline)
                .foregroundColor(.zoltoMuted)

            if product.quantity > 1 {
                Text("\(product.quantity) left")
                    .font(.caption.weight(.medium))
                    .foregroundColor(.zoltoMuted)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.zoltoSurface)
                    .cornerRadius(4)
            }

            // Only reachable with "Show Hidden Items" on — flags a piece the
            // storefront isn't showing.
            if !product.visible {
                Text("HIDDEN")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(0.5)
                    .foregroundColor(.white)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.red)
                    .cornerRadius(4)
            }
        }
    }

    private var selectionIndicator: some View {
        Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
            .font(.system(size: 24))
            .foregroundColor(isSelected ? .zoltoAccent : .zoltoBorder)
            .accessibilityHidden(true)
    }
}
