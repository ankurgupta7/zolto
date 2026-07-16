import SwiftUI

struct ContentView: View {
    @StateObject private var viewModel = WebViewModel()

    var body: some View {
        ZStack {
            WebView(viewModel: viewModel)
                .ignoresSafeArea()

            switch viewModel.state {
            case .loading:
                SplashView()
                    .transition(.opacity)
            case .error(let offline):
                ErrorView(offline: offline, retry: viewModel.reload)
                    .transition(.opacity)
            case .loaded:
                EmptyView()
            }
        }
        .animation(.easeInOut(duration: 0.25), value: viewModel.state)
    }
}
