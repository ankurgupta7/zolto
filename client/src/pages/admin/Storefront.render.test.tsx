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
  // Restore the shared fixture: the colour tests below reassign it, and a
  // leaked value would silently change what the later tests are asserting.
  mocks.settingsData = {
    logoUrl: null,
    primaryColor: "#8B6914",
    metaTitle: "Kalakosh",
    metaDescription: "Handmade",
  };
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

  it("prefills the secondary colour and saves both halves of the brand", () => {
    mocks.settingsData = {
      logoUrl: null,
      primaryColor: "#8B6914",
      secondaryColor: "#2E7DD1",
      metaTitle: "Kalakosh",
      metaDescription: "Handmade",
    };
    render(<Storefront />);
    expect(screen.getByDisplayValue("#2E7DD1")).toBeTruthy();
    fireEvent.click(screen.getAllByText("Save changes")[0]);
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        primaryColor: "#8B6914",
        secondaryColor: "#2E7DD1",
      }),
    );
  });

  // Blank means "derive the accent from the primary" — a store that never
  // picked a highlight must not have one invented and persisted for it.
  it("sends no secondary colour when the field is left blank", () => {
    mocks.settingsData = {
      logoUrl: null,
      primaryColor: "#8B6914",
      secondaryColor: null,
      metaTitle: "Kalakosh",
      metaDescription: "Handmade",
    };
    render(<Storefront />);
    fireEvent.click(screen.getAllByText("Save changes")[0]);
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ secondaryColor: undefined }),
    );
  });

  it("refuses to save a malformed secondary colour", () => {
    mocks.settingsData = {
      logoUrl: null,
      primaryColor: "#8B6914",
      secondaryColor: null,
      metaTitle: "Kalakosh",
      metaDescription: "Handmade",
    };
    render(<Storefront />);
    fireEvent.change(screen.getByPlaceholderText("#B8963E"), {
      target: { value: "gold" },
    });
    fireEvent.click(screen.getAllByText("Save changes")[0]);
    expect(mocks.save).not.toHaveBeenCalled();
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
