import SwiftUI

// MARK: - Zolto POS — Neutral Platform Palette
// The app chrome is deliberately brand-neutral: the paired store's own
// identity (name, logo) comes from the server at runtime (StoreSession),
// while these tokens style the surrounding POS UI the same for every
// merchant. Cool near-blacks and off-whites, one calm indigo accent.
extension Color {
    // Grounds
    static let zoltoBackground = Color(red: 247/255, green: 247/255, blue: 245/255)  // #F7F7F5
    static let zoltoSurface    = Color(red: 239/255, green: 239/255, blue: 236/255)  // #EFEFEC
    static let zoltoBorder     = Color(red: 220/255, green: 221/255, blue: 218/255)  // #DCDDDA

    // Ink
    static let zoltoInk        = Color(red: 26/255,  green: 28/255,  blue: 30/255)   // #1A1C1E
    static let zoltoInkPressed = Color(red: 43/255,  green: 46/255,  blue: 49/255)   // #2B2E31
    static let zoltoInkLight   = Color(red: 60/255,  green: 64/255,  blue: 67/255)   // #3C4043
    static let zoltoMuted      = Color(red: 110/255, green: 114/255, blue: 118/255)  // #6E7276

    // Accent — used for prices, selection highlights, and success accents.
    static let zoltoAccent      = Color(red: 66/255,  green: 99/255,  blue: 235/255) // #4263EB
    static let zoltoAccentLight = Color(red: 92/255,  green: 124/255, blue: 250/255) // #5C7CFA
}

// MARK: - Button styles

struct ZoltoPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(.headline, design: .default).weight(.semibold))
            .tracking(1.2)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(configuration.isPressed ? Color.zoltoInkPressed : Color.zoltoInk)
            .foregroundColor(.zoltoBackground)
            .cornerRadius(4)
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}

struct ZoltoOutlinedButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(.subheadline, design: .default).weight(.medium))
            .tracking(0.8)
            .padding(.horizontal, 20)
            .padding(.vertical, 10)
            .foregroundColor(configuration.isPressed ? .zoltoInkPressed : .zoltoInk)
            .overlay(
                RoundedRectangle(cornerRadius: 4)
                    .stroke(Color.zoltoInk, lineWidth: 1)
            )
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}

struct ZoltoAccentButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(.headline, design: .default).weight(.semibold))
            .tracking(1.2)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(configuration.isPressed ? Color.zoltoAccentLight : Color.zoltoAccent)
            .foregroundColor(.white)
            .cornerRadius(4)
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}
