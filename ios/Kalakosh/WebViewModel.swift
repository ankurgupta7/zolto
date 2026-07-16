import SwiftUI
import WebKit
import Network

enum PageState: Equatable {
    case loading
    case loaded
    case error(offline: Bool)
}

class WebViewModel: NSObject, ObservableObject {
    @Published var state: PageState = .loading

    weak var webView: WKWebView?

    private let homeURL = URL(string: "https://kalakosh.ch")!
    private let monitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "ch.kalakosh.network")

    override init() {
        super.init()
        monitor.pathUpdateHandler = { [weak self] path in
            guard let self else { return }
            if path.status == .satisfied, case .error = self.state {
                DispatchQueue.main.async { self.reload() }
            }
        }
        monitor.start(queue: monitorQueue)
    }

    deinit {
        monitor.cancel()
    }

    func attach(_ webView: WKWebView) {
        self.webView = webView
        reload()
    }

    func reload() {
        state = .loading
        webView?.load(URLRequest(url: homeURL))
    }
}

extension WebViewModel: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        DispatchQueue.main.async { self.state = .loaded }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        DispatchQueue.main.async { self.state = .error(offline: self.isOfflineError(error)) }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let code = (error as NSError).code
        guard code != NSURLErrorCancelled else { return }
        DispatchQueue.main.async { self.state = .error(offline: self.isOfflineError(error)) }
    }

    // Open external links in Safari instead of inside the app
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.allow); return }
        let host = url.host ?? ""
        if navigationAction.navigationType == .linkActivated, !host.contains("kalakosh.ch") {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
        } else {
            decisionHandler(.allow)
        }
    }

    private func isOfflineError(_ error: Error) -> Bool {
        let code = (error as NSError).code
        return code == NSURLErrorNotConnectedToInternet
            || code == NSURLErrorNetworkConnectionLost
            || code == NSURLErrorDataNotAllowed
            || code == NSURLErrorTimedOut
    }
}
