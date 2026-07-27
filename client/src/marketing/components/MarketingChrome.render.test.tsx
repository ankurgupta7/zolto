import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StoreShortcut } from "./MarketingChrome";

const mocks = vi.hoisted(() => ({
  meData: undefined as unknown,
  storeData: undefined as unknown,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: { me: { useQuery: () => ({ data: mocks.meData }) } },
    tenant: { myStore: { useQuery: () => ({ data: mocks.storeData }) } },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.meData = undefined;
  mocks.storeData = undefined;
});
afterEach(() => cleanup());

describe("StoreShortcut (marketing 'go to your store')", () => {
  it("renders nothing for a logged-out visitor", () => {
    const { container } = render(<StoreShortcut />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the user has no store", () => {
    mocks.meData = { id: 1 };
    mocks.storeData = null;
    const { container } = render(<StoreShortcut />);
    expect(container.firstChild).toBeNull();
  });

  it("links a signed-in merchant back to their store admin", () => {
    mocks.meData = { id: 1 };
    mocks.storeData = { slug: "kalakosh", name: "Kalakosh" };
    render(<StoreShortcut />);
    const link = screen.getByText("Go to your store").closest("a");
    expect(link).toBeTruthy();
    // jsdom host is localhost → same-origin, surface-forced form.
    expect(link?.getAttribute("href")).toBe(
      "/admin?surface=storefront&tenant=kalakosh",
    );
  });
});
