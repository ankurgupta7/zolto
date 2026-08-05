import SwiftUI

// MARK: - Zolto Zürich — Pearl Jeweller Warm Palette
// Inspired by Zürich semi-precious boutiques: warm oyster ground,
// mahogany darks, refined gold. Every neutral has a warm (brown/amber)
// undertone — never cold grey.
extension Color {
    // Core warm neutrals
    static let zoltoOysterCream   = Color(red: 247/255, green: 243/255, blue: 238/255)  // #F7F3EE
    static let zoltoWarmNearBlack = Color(red: 28/255,  green: 23/255,  blue: 20/255)   // #1C1714
    static let zoltoMahogany      = Color(red: 45/255,  green: 38/255,  blue: 32/255)   // #2D2620
    static let zoltoWarmDarkMid   = Color(red: 58/255,  green: 48/255,  blue: 40/255)   // #3A3028
    static let zoltoWarmIvory     = Color(red: 237/255, green: 231/255, blue: 223/255)  // #EDE7DF
    static let zoltoWarmMuted     = Color(red: 122/255, green: 109/255, blue: 101/255)  // #7A6D65
    static let zoltoWarmBorder    = Color(red: 221/255, green: 212/255, blue: 201/255)  // #DDD4C9

    // Gold accent — refined, precious
    static let zoltoGold          = Color(red: 184/255, green: 150/255, blue: 62/255)   // #B8963E
    static let zoltoGoldLight     = Color(red: 212/255, green: 176/255, blue: 96/255)   // #D4B060

    // Semantic aliases — views reference these; updating here cascades everywhere
    static let zoltoNearBlack        = zoltoWarmNearBlack
    static let zoltoCharcoal         = zoltoMahogany
    static let zoltoDarkGrey         = zoltoWarmDarkMid
    static let zoltoWarmWhite        = zoltoOysterCream
    static let zoltoSoftWhite        = zoltoWarmIvory
    static let zoltoSoftIvory        = zoltoWarmIvory
    static let zoltoWarmCream        = zoltoOysterCream
    static let zoltoMutedText        = zoltoWarmMuted
    static let zoltoBorder           = zoltoWarmBorder
    static let zoltoDeepText         = zoltoWarmNearBlack
    // Legacy forest names kept so older view references compile
    static let zoltoForestGreen      = zoltoWarmNearBlack
    static let zoltoForestGreenDark  = zoltoMahogany
    static let zoltoForestGreenLight = zoltoWarmDarkMid
}

// MARK: - Button styles

struct ZoltoPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(.headline, design: .default).weight(.semibold))
            .tracking(1.2)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(configuration.isPressed ? Color.zoltoMahogany : Color.zoltoWarmNearBlack)
            .foregroundColor(.zoltoOysterCream)
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
            .foregroundColor(configuration.isPressed ? .zoltoMahogany : .zoltoWarmNearBlack)
            .overlay(
                RoundedRectangle(cornerRadius: 4)
                    .stroke(Color.zoltoWarmNearBlack, lineWidth: 1)
            )
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}

struct ZoltoGoldButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(.headline, design: .default).weight(.semibold))
            .tracking(1.2)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(configuration.isPressed ? Color.zoltoGoldLight : Color.zoltoGold)
            .foregroundColor(.zoltoWarmNearBlack)
            .cornerRadius(4)
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}
