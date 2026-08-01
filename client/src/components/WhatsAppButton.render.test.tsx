import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NEUTRAL_BRANDING, type Branding } from "@/lib/branding";
import WhatsAppButton from "./WhatsAppButton";

const mocks = vi.hoisted(() => ({
  branding: {} as Record<string, unknown>,
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({
    slug: "bergblume",
    branding: mocks.branding as unknown as Branding,
    isLoading: false,
    notFound: false,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.branding = {
    ...NEUTRAL_BRANDING,
    storeName: "Bergblume",
    whatsappNumber: "41790001122",
    instagramHandle: "bergblume",
  };
});
afterEach(() => cleanup());

describe("WhatsAppButton", () => {
  it("links to wa.me with a prefilled greeting naming the store", () => {
    render(<WhatsAppButton />);
    const link = screen.getByRole("link", {
      name: "Chat with us on WhatsApp",
    }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(
      `https://wa.me/41790001122?text=${encodeURIComponent(
        "Hi, I found Bergblume (@bergblume) and I'd love to know more!",
      )}`,
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("omits the handle from the greeting when the tenant has none", () => {
    mocks.branding = { ...mocks.branding, instagramHandle: null };
    render(<WhatsAppButton />);
    const link = screen.getByRole("link", {
      name: "Chat with us on WhatsApp",
    });
    expect(link.getAttribute("href")).not.toContain(encodeURIComponent("@"));
  });

  it("renders nothing when the tenant has no WhatsApp number", () => {
    mocks.branding = { ...mocks.branding, whatsappNumber: null };
    const { container } = render(<WhatsAppButton />);
    expect(container.innerHTML).toBe("");
  });
});
