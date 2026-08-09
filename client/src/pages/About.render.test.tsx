import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import i18n from "@/lib/i18n";
import { EMPTY_CONTENT } from "@/lib/storefrontContent";
import About from "./About";

const mocks = vi.hoisted(() => ({
  branding: {
    storeName: "Aurora Atelier",
    shortName: "Aurora",
    whatsappNumber: null,
    instagramHandle: null,
    contactEmail: null,
    logoUrl: null,
    logoUrlDark: null,
    currency: "chf",
    primaryColor: "#2D2620",
    secondaryColor: null,
  },
  content: { aboutBody: null as string | null },
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({
    slug: "aurora",
    branding: mocks.branding,
    content: { ...EMPTY_CONTENT, ...mocks.content },
    isLoading: false,
    notFound: false,
  }),
}));

function renderAbout() {
  const { hook } = memoryLocation({ path: "/about" });
  return render(
    <Router hook={hook}>
      <About />
    </Router>,
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  // The storefront defaults to German; pin English so copy assertions hold.
  await i18n.changeLanguage("en");
  mocks.content.aboutBody = null;
});
afterEach(() => cleanup());

describe("About page", () => {
  it("falls back to the generated copy when the merchant has written none", () => {
    renderAbout();
    expect(
      screen.getByRole("heading", { level: 1, name: "About Aurora Atelier" }),
    ).toBeTruthy();
    expect(screen.getByText(/sells online and in person/i)).toBeTruthy();
  });

  it("renders the merchant's own story, one paragraph per blank line", () => {
    mocks.content.aboutBody =
      "We opened in 2018 with one kiln.\n\nEverything is thrown by hand.";
    renderAbout();
    expect(screen.getByText("We opened in 2018 with one kiln.")).toBeTruthy();
    expect(screen.getByText("Everything is thrown by hand.")).toBeTruthy();
    // The template copy it replaced is gone, not appended below it.
    expect(screen.queryByText(/sells online and in person/i)).toBeNull();
  });

  it("keeps the translated heading and CTAs around authored copy", () => {
    // The merchant supplies the story; the page chrome stays the platform's,
    // so a visitor browsing in another language still gets working navigation.
    mocks.content.aboutBody = "We opened in 2018 with one kiln.";
    renderAbout();
    expect(
      screen.getByRole("heading", { level: 1, name: "About Aurora Atelier" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /browse the shop/i })
        .getAttribute("href"),
    ).toBe("/shop");
    expect(
      screen.getByRole("link", { name: /get in touch/i }).getAttribute("href"),
    ).toBe("/contact");
  });

  it("shows authored copy as written while the heading translates", async () => {
    mocks.content.aboutBody = "We opened in 2018 with one kiln.";
    await i18n.changeLanguage("de");
    renderAbout();
    expect(
      screen.getByRole("heading", { level: 1, name: "Über Aurora Atelier" }),
    ).toBeTruthy();
    expect(screen.getByText("We opened in 2018 with one kiln.")).toBeTruthy();
  });
});
