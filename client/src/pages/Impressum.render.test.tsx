import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import i18n from "@/lib/i18n";
import { EMPTY_CONTENT, type StorefrontContent } from "@/lib/storefrontContent";
import Impressum from "./Impressum";

const mocks = vi.hoisted(() => ({
  branding: {
    storeName: "Aurora Atelier",
    shortName: "Aurora",
    whatsappNumber: null,
    instagramHandle: null,
    contactEmail: "hi@aurora.example",
    logoUrl: null,
    logoUrlDark: null,
    currency: "chf",
    primaryColor: "#2D2620",
    secondaryColor: null,
  },
  content: {} as Partial<StorefrontContent>,
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

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("en");
  mocks.content = {};
});
afterEach(() => cleanup());

describe("Impressum page", () => {
  it("names the store and tells a merchant with no details what to add", () => {
    render(<Impressum />);
    expect(screen.getByText(/Operated by Aurora Atelier/)).toBeTruthy();
    expect(screen.getByText(/registered address/i)).toBeTruthy();
  });

  it("publishes the company details once they are filled in", () => {
    mocks.content = {
      companyLegalName: "Aurora Atelier GmbH",
      companyAddress: "Musterstrasse 1\n8001 Basel",
      vatNumber: "CHE-123.456.789 MWST",
      companyRegistration: "CH-020.3.001.234-5",
    };
    render(<Impressum />);
    // The legal notice names the registered entity, not the shopfront name.
    expect(screen.getByText(/Operated by Aurora Atelier GmbH/)).toBeTruthy();
    expect(screen.getByText(/Musterstrasse 1/)).toBeTruthy();
    expect(screen.getByText(/CHE-123\.456\.789 MWST/)).toBeTruthy();
    expect(screen.getByText(/CH-020\.3\.001\.234-5/)).toBeTruthy();
  });

  // The note is advice for a merchant who hasn't added their details. Once
  // they have, leaving it up puts a "this store still needs to do this"
  // disclaimer on a legal notice that is already complete.
  it("drops the you-still-need-these note once an address exists", () => {
    mocks.content = { companyAddress: "Musterstrasse 1\n8001 Basel" };
    render(<Impressum />);
    expect(screen.queryByText(/registered address/i)).toBeNull();
  });

  it("keeps the note for a store that has only a VAT number", () => {
    // A VAT number alone is not an imprint; the address is the part every
    // jurisdiction asks for.
    mocks.content = { vatNumber: "CHE-123.456.789 MWST" };
    render(<Impressum />);
    expect(screen.getByText(/registered address/i)).toBeTruthy();
  });

  it("renders a multi-line address across lines, not run together", () => {
    mocks.content = { companyAddress: "Musterstrasse 1\n8001 Basel" };
    render(<Impressum />);
    const line = screen.getByText(/Musterstrasse 1/);
    expect(line.textContent).toContain("\n8001 Basel");
    expect(line.className).toContain("whitespace-pre-line");
  });

  it("translates the labels around the merchant's own details", async () => {
    mocks.content = {
      companyAddress: "Musterstrasse 1",
      vatNumber: "CHE-123.456.789 MWST",
    };
    await i18n.changeLanguage("de");
    render(<Impressum />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Impressum" }),
    ).toBeTruthy();
    expect(screen.getByText(/MWST-Nummer/)).toBeTruthy();
    expect(screen.getByText(/Adresse:/)).toBeTruthy();
  });
});
