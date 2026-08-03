import SwiftUI

// MARK: - Kalakosh Zürich — Pearl Jeweller Warm Palette
// Inspired by Zürich semi-precious boutiques: warm oyster ground,
// mahogany darks, refined gold. Every neutral has a warm (brown/amber)
// undertone — never cold grey.
extension Color {
    // Core warm neutrals
    static let kalakoshOysterCream   = Color(red: 247/255, green: 243/255, blue: 238/255)  // #F7F3EE
    static let kalakoshWarmNearBlack = Color(red: 28/255,  green: 23/255,  blue: 20/255)   // #1C1714
    static let kalakoshMahogany      = Color(red: 45/255,  green: 38/255,  blue: 32/255)   // #2D2620
    static let kalakoshWarmDarkMid   = Color(red: 58/255,  green: 48/255,  blue: 40/255)   // #3A3028
    static let kalakoshWarmIvory     = Color(red: 237/255, green: 231/255, blue: 223/255)  // #EDE7DF
    static let kalakoshWarmMuted     = Color(red: 122/255, green: 109/255, blue: 101/255)  // #7A6D65
    static let kalakoshWarmBorder    = Color(red: 221/255, green: 212/255, blue: 201/255)  // #DDD4C9

    // Gold accent — refined, precious
    static let kalakoshGold          = Color(red: 184/255, green: 150/255, blue: 62/255)   // #B8963E
    static let kalakoshGoldLight     = Color(red: 212/255, green: 176/255, blue: 96/255)   // #D4B060

    // Semantic aliases — views reference these; updating here cascades everywhere
    static let kalakoshNearBlack        = kalakoshWarmNearBlack
    static let kalakoshCharcoal         = kalakoshMahogany
    static let kalakoshDarkGrey         = kalakoshWarmDarkMid
    static let kalakoshWarmWhite        = kalakoshOysterCream
    static let kalakoshSoftWhite        = kalakoshWarmIvory
    static let kalakoshSoftIvory        = kalakoshWarmIvory
    static let kalakoshWarmCream        = kalakoshOysterCream
    static let kalakoshMutedText        = kalakoshWarmMuted
    static let kalakoshBorder           = kalakoshWarmBorder
    static let kalakoshDeepText         = kalakoshWarmNearBlack
    // Legacy forest names kept so older view references compile
    static let kalakoshForestGreen      = kalakoshWarmNearBlack
    static let kalakoshForestGreenDark  = kalakoshMahogany
    static let kalakoshForestGreenLight = kalakoshWarmDarkMid
}

// MARK: - Button styles

struct KalakoshPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(.headline, design: .default).weight(.semibold))
            .tracking(1.2)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(configuration.isPressed ? Color.kalakoshMahogany : Color.kalakoshWarmNearBlack)
            .foregroundColor(.kalakoshOysterCream)
            .cornerRadius(4)
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}

struct KalakoshOutlinedButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(.subheadline, design: .default).weight(.medium))
            .tracking(0.8)
            .padding(.horizontal, 20)
            .padding(.vertical, 10)
            .foregroundColor(configuration.isPressed ? .kalakoshMahogany : .kalakoshWarmNearBlack)
            .overlay(
                RoundedRectangle(cornerRadius: 4)
                    .stroke(Color.kalakoshWarmNearBlack, lineWidth: 1)
            )
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}

struct KalakoshGoldButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(.headline, design: .default).weight(.semibold))
            .tracking(1.2)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(configuration.isPressed ? Color.kalakoshGoldLight : Color.kalakoshGold)
            .foregroundColor(.kalakoshWarmNearBlack)
            .cornerRadius(4)
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}
