import SwiftUI

struct ErrorView: View {
    let offline: Bool
    let retry: () -> Void

    var body: some View {
        ZStack {
            Color.white.ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                Image("kalakosh-logo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 110)
                    .padding(.bottom, 48)

                Text("Uh oh.")
                    .font(.system(size: 36, weight: .bold))
                    .foregroundColor(.black)

                Text("Things are breaking.")
                    .font(.system(size: 20, weight: .medium))
                    .foregroundColor(.black)
                    .padding(.top, 6)

                Text(
                    offline
                        ? "You seem to be offline.\nCheck your connection and try again."
                        : "Something went wrong on our end.\nWe're already on it."
                )
                .font(.system(size: 15))
                .foregroundColor(Color(.systemGray))
                .multilineTextAlignment(.center)
                .lineSpacing(4)
                .padding(.horizontal, 40)
                .padding(.top, 14)

                Spacer()

                Button(action: retry) {
                    Text("Try Again")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 54)
                        .background(Color.black)
                        .cornerRadius(14)
                }
                .padding(.horizontal, 32)
                .padding(.bottom, 52)
            }
        }
    }
}
