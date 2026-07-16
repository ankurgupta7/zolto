import SwiftUI

struct SplashView: View {
    var body: some View {
        ZStack {
            Color.white.ignoresSafeArea()
            VStack(spacing: 32) {
                Image("kalakosh-logo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 140)
                ProgressView()
                    .progressViewStyle(.circular)
                    .tint(.black)
            }
        }
    }
}
