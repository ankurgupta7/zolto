import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import i18n from "@/lib/i18n";
import en from "@/locales/en.json";
import de from "@/locales/de.json";
import { CartProvider, useCart, type CartItem } from "@/contexts/CartContext";
import Navbar from "./Navbar";

const CART_KEY = "kalakosh_cart";

const mocks = vi.hoisted(() => ({
  authState: { user: null as { role: string } | null },
  branding: {
    storeName: "Aurora Atelier",
    shortName: "Aurora",
    whatsappNumber: null as string | null,
    instagramHandle: "aurora.atelier" as string | null,
    contactEmail: null,
    logoUrl: null as string | null,
    logoUrlDark: null,
    currency: "chf",
    primaryColor: "#2D2620",
  },
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => mocks.authState }));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({
    slug: "aurora",
    branding: mocks.branding,
    isLoading: false,
    notFound: false,
  }),
}));

function CartProbe() {
  const { isOpen, count } = useCart();
  return <div data-testid="cart-probe" data-open={isOpen} data-count={count} />;
}

const probe = () => screen.getByTestId("cart-probe");

const seededBag: CartItem[] = [
  {
    id: 1,
    name: "Ring",
    nameEn: "Ring",
    nameDe: null,
    nameFr: null,
    price: "185.00",
    imageUrl: null,
    category: "Rings",
  },
  {
    id: 2,
    name: "Earrings",
    nameEn: "Earrings",
    nameDe: null,
    nameFr: null,
    price: "120.00",
    imageUrl: null,
    category: "Earrings",
  },
];

function renderNavbar(path = "/") {
  const { hook, history } = memoryLocation({ path, record: true });
  const view = render(
    <Router hook={hook}>
      <CartProvider>
        <Navbar />
        <CartProbe />
      </CartProvider>
    </Router>,
  );
  return { ...view, history };
}

// The collapsible mobile panel is the header's last direct child.
const mobilePanel = (container: HTMLElement) =>
  container.querySelector("header > div:last-of-type") as HTMLElement;

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.authState.user = null;
  mocks.branding.logoUrl = null;
  await i18n.changeLanguage("en");
});

afterEach(() => cleanup());

describe("Navbar", () => {
  it("renders every nav link in desktop and mobile menus with correct targets", () => {
    renderNavbar();
    for (const [label, href] of [
      [en.nav.home, "/"],
      [en.nav.shop, "/shop"],
      [en.nav.about, "/about"],
      [en.nav.faq, "/faq"],
      [en.nav.contact, "/contact"],
    ] as const) {
      const links = screen.getAllByRole("link", { name: label });
      expect(links).toHaveLength(2);
      for (const link of links) expect(link.getAttribute("href")).toBe(href);
    }
  });

  it("falls back to the store name as the logo and links it home", () => {
    renderNavbar();
    const brand = screen.getByText("Aurora Atelier").closest("a");
    expect(brand?.getAttribute("href")).toBe("/");
  });

  it("renders the tenant logo image when one is configured", () => {
    mocks.branding.logoUrl = "https://cdn.test/logo.png";
    renderNavbar();
    const logo = screen.getByAltText("Aurora Atelier");
    expect(logo.getAttribute("src")).toBe("https://cdn.test/logo.png");
  });

  it("hides admin links from shoppers and shows them to admins", () => {
    renderNavbar();
    expect(screen.queryByText(en.nav.admin)).toBeNull();
    cleanup();

    mocks.authState.user = { role: "admin" };
    renderNavbar();
    const admin = screen.getAllByRole("link", { name: en.nav.admin });
    expect(admin.length).toBeGreaterThan(0);
    expect(admin[0].getAttribute("href")).toBe("/admin");
    const upload = screen.getAllByRole("link", { name: en.nav.upload });
    expect(upload[0].getAttribute("href")).toBe("/admin/bulk-upload");
  });

  it("shows admin links to the platform owner (superadmin) too", () => {
    mocks.authState.user = { role: "superadmin" };
    renderNavbar();
    const admin = screen.getAllByRole("link", { name: en.nav.admin });
    expect(admin.length).toBeGreaterThan(0);
    expect(admin[0].getAttribute("href")).toBe("/admin");
  });

  it("shows the bag count only when the bag has items and opens the drawer on click", () => {
    renderNavbar();
    expect(screen.queryByText("2")).toBeNull();
    cleanup();

    localStorage.setItem(CART_KEY, JSON.stringify(seededBag));
    renderNavbar();
    // Desktop and compact mobile buttons both carry the badge.
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    expect(probe().getAttribute("data-open")).toBe("false");
    fireEvent.click(screen.getAllByLabelText("Open shopping bag")[0]);
    expect(probe().getAttribute("data-open")).toBe("true");
  });

  it("switches the storefront language and persists the choice", () => {
    renderNavbar();
    const switcher = screen.getAllByLabelText("Switch language")[0];
    expect(switcher.textContent).toBe("DE");

    fireEvent.click(switcher);
    expect(i18n.language).toBe("de");
    expect(localStorage.getItem("kalakosh_lang")).toBe("de");
    expect(screen.getAllByText(de.nav.home).length).toBeGreaterThan(0);
    expect(switcher.textContent).toBe("EN");

    fireEvent.click(switcher);
    expect(i18n.language).toBe("en");
    expect(localStorage.getItem("kalakosh_lang")).toBe("en");
  });

  it("toggles the mobile menu open and closed", () => {
    const { container } = renderNavbar();
    const toggle = screen.getByLabelText("Toggle menu");
    expect(mobilePanel(container).className).toContain("max-h-0");
    fireEvent.click(toggle);
    expect(mobilePanel(container).className).toContain("max-h-96");
    fireEvent.click(toggle);
    expect(mobilePanel(container).className).toContain("max-h-0");
  });

  it("closes the mobile menu when a link navigates to a new route", () => {
    const { container, history } = renderNavbar();
    fireEvent.click(screen.getByLabelText("Toggle menu"));
    expect(mobilePanel(container).className).toContain("max-h-96");

    // Second instance of each link lives in the mobile panel.
    fireEvent.click(screen.getAllByRole("link", { name: en.nav.shop })[1]);
    expect(history).toContain("/shop");
    expect(mobilePanel(container).className).toContain("max-h-0");
  });

  it("links to the tenant's Instagram profile", () => {
    renderNavbar();
    const ig = screen.getByLabelText("Aurora Atelier on Instagram");
    expect(ig.getAttribute("href")).toBe(
      "https://www.instagram.com/aurora.atelier",
    );
  });
});
