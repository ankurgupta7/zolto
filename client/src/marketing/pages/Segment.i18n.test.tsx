import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import i18n from "@/lib/i18n";
import Segment from "./Segment";
import { SEGMENTS, segmentFeatures } from "@shared/segments";

afterEach(async () => {
  cleanup();
  // jsdom's navigator.language is en-US, so the suite's baseline is English —
  // restore it so this file leaves no language behind for other tests.
  await i18n.changeLanguage("en");
  localStorage.removeItem("kalakosh_lang");
});

function renderSegment(path: string) {
  const { hook } = memoryLocation({ path, static: true });
  return render(
    <Router hook={hook}>
      <Route path="/for" component={Segment} />
      <Route path="/for/:segment" component={Segment} />
    </Router>,
  );
}

describe("Segment — multilingual rendering", () => {
  it("renders German copy after switching to de", async () => {
    await i18n.changeLanguage("de");
    renderSegment("/for/market-stalls");

    // Page chrome.
    expect(
      screen.getByRole("heading", { name: "Was normalerweise im Weg steht" }),
    ).toBeTruthy();

    // shared/segments.ts strings, reached through st().
    const segment = SEGMENTS.find((s) => s.id === "market-stalls")!;
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Für Verkäufer, deren Laden ein Tisch, ein Van oder ein Wochenende ist",
      }),
    ).toBeTruthy();
    expect(screen.queryByText(segment.scenario)).toBeNull();

    // shared/platform.ts FEATURES render translated too.
    const feature = segmentFeatures(segment)[0];
    expect(screen.queryByText(feature.description)).toBeNull();
    expect(
      screen.getByText("Tap to Pay — kein Kartenlesegerät zu kaufen"),
    ).toBeTruthy();
  });

  it("titles the page in the current language", async () => {
    await i18n.changeLanguage("fr");
    renderSegment("/for/boutiques");
    expect(document.title).toContain("au diapason");
  });

  it("falls back to the shared English string for an untranslated segment", () => {
    const missing = i18n.t("marketing:shared.segments.brand-new.headline", {
      defaultValue: "For a segment nobody has translated yet",
    });
    expect(missing).toBe("For a segment nobody has translated yet");
  });
});
