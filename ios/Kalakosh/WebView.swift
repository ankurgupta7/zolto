import SwiftUI
import WebKit

struct WebView: UIViewRepresentable {
    @ObservedObject var viewModel: WebViewModel

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = viewModel
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.showsHorizontalScrollIndicator = false
        webView.isOpaque = false
        webView.backgroundColor = .white

        let refresh = UIRefreshControl()
        refresh.tintColor = .black
        refresh.addTarget(context.coordinator, action: #selector(Coordinator.pullToRefresh(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = refresh

        viewModel.attach(webView)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        if viewModel.state != .loading {
            webView.scrollView.refreshControl?.endRefreshing()
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator(viewModel: viewModel) }

    final class Coordinator: NSObject {
        let viewModel: WebViewModel
        init(viewModel: WebViewModel) { self.viewModel = viewModel }

        @objc func pullToRefresh(_ sender: UIRefreshControl) {
            viewModel.reload()
        }
    }
}
