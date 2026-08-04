import SwiftUI

struct DiscoveryControlBar: View {
    @ObservedObject var viewModel: ProductViewModel
    
    var body: some View {
        HStack(spacing: 12) {
            // Sort Picker
            Menu {
                Picker("Sort By", selection: $viewModel.sortBy) {
                    ForEach(ProductViewModel.SortMode.allCases) { mode in
                        Text(mode.rawValue).tag(mode)
                    }
                }
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "arrow.up.arrow.down")
                    Text(viewModel.sortBy.rawValue)
                    Image(systemName: "chevron.down")
                        .font(.caption2)
                }
                .font(.subheadline.weight(.medium))
                .foregroundColor(.zoltoNearBlack)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color.white)
                .cornerRadius(8)
                .shadow(color: .black.opacity(0.05), radius: 2, x: 0, y: 1)
            }
            
            Spacer()
            
            // View Mode Toggle
            Picker("View Mode", selection: $viewModel.viewMode) {
                ForEach(ProductViewModel.ViewMode.allCases) { mode in
                    Image(systemName: mode == .grid ? "square.grid.2x2" : "list.bullet")
                        .tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .frame(width: 100)
            .scaleEffect(0.9)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Color.zoltoWarmWhite)
    }
}
