import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
} from "@testing-library/react";
import Storefront from "./Storefront";

const mocks = vi.hoisted(() => ({
  meData: { slug: "kalakosh", name: "Kalakosh" } as Record<string, unknown>,
  settingsData: {
    logoUrl: null,
    primaryColor: "#8B6914",
    metaTitle: "Kalakosh",
    metaDescription: "Handmade",
  } as Record<string, unknown> | null,
  save: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      tenant: {
        me: { invalidate: vi.fn() },
        getSettings: { invalidate: vi.fn() },
      },
    }),
    tenant: {
      me: { useQuery: () => ({ data: mocks.meData, isLoading: false }) },
      getSettings: {
        useQuery: () => ({ data: mocks.settingsData, isLoading: false }),
      },
      updateSettings: {
        useMutation: () => ({ mutate: mocks.save, isPending: false }),
      },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => cleanup());

describe("Storefront page", () => {
  it("renders branding + SEO fields prefilled from settings", () => {
    render(<Storefront />);
    expect(screen.getByText("Storefront")).toBeTruthy();
    expect(screen.getByDisplayValue("#8B6914")).toBeTruthy();
    expect(screen.getByDisplayValue("Kalakosh")).toBeTruthy();
    expect(screen.getByText("View storefront")).toBeTruthy();
  });

  it("saves changed settings", () => {
    render(<Storefront />);
    fireEvent.change(screen.getByPlaceholderText("Your store — handcrafted items"), {
      target: { value: "New title" },
    });
    fireEvent.click(screen.getAllByText("Save changes")[1]);
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ metaTitle: "New title" }),
    );
  });

  it("rejects an invalid logo URL before saving", () => {
    render(<Storefront />);
    fireEvent.change(screen.getByPlaceholderText("https://…/logo.png"), {
      target: { value: "not-a-url" },
    });
    fireEvent.click(screen.getAllByText("Save changes")[0]);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
