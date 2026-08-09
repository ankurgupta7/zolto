import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
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
    fireEvent.change(
      screen.getByPlaceholderText("Your store — handcrafted items"),
      {
        target: { value: "New title" },
      },
    );
    // Card order is Branding, Home & About, SEO — every button runs the same
    // handler and submits the whole form, so the index only picks which card
    // the click came from.
    fireEvent.click(screen.getAllByText("Save changes")[2]);
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

describe("Storefront page — merchant-authored content", () => {
  it("prefills the display name, hero and About body from settings", () => {
    mocks.settingsData = {
      ...mocks.settingsData,
      whiteLabelName: "Kalakosh Zürich",
      heroImageUrl: "https://cdn.example/shopfront.jpg",
      heroHeadline: "Made by hand",
      heroSubtitle: "In the old town since 2018",
      aboutBody: "We opened with one kiln.",
    };
    render(<Storefront />);
    expect(screen.getByDisplayValue("Kalakosh Zürich")).toBeTruthy();
    expect(screen.getByDisplayValue("Made by hand")).toBeTruthy();
    expect(screen.getByDisplayValue("In the old town since 2018")).toBeTruthy();
    expect(screen.getByDisplayValue("We opened with one kiln.")).toBeTruthy();
  });

  it("saves what the merchant wrote", () => {
    render(<Storefront />);
    fireEvent.change(screen.getByLabelText("Home headline"), {
      target: { value: "Made by hand" },
    });
    fireEvent.change(screen.getByLabelText("About page"), {
      target: { value: "First para.\n\nSecond para." },
    });
    fireEvent.click(screen.getAllByText("Save changes")[1]);
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        heroHeadline: "Made by hand",
        aboutBody: "First para.\n\nSecond para.",
      }),
    );
  });

  // The behaviour that makes this safe to try: emptying a box has to delete
  // the text and bring the generated copy back. `undefined` would leave the
  // old text live while the field looked cleared.
  it("sends null for a field the merchant emptied, not undefined", () => {
    mocks.settingsData = {
      ...mocks.settingsData,
      heroHeadline: "Made by hand",
      aboutBody: "We opened with one kiln.",
    };
    render(<Storefront />);
    fireEvent.change(screen.getByLabelText("Home headline"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("About page"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getAllByText("Save changes")[1]);
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ heroHeadline: null, aboutBody: null }),
    );
  });

  it("rejects a banner image that is not a URL before saving", () => {
    render(<Storefront />);
    fireEvent.change(screen.getByLabelText("Home banner image"), {
      target: { value: "shopfront.jpg" },
    });
    fireEvent.click(screen.getAllByText("Save changes")[1]);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("previews the banner only once it is a usable URL", () => {
    render(<Storefront />);
    expect(screen.queryByAltText("Banner preview")).toBeNull();
    fireEvent.change(screen.getByLabelText("Home banner image"), {
      target: { value: "https://cdn.example/shopfront.jpg" },
    });
    expect(screen.getByAltText("Banner preview").getAttribute("src")).toBe(
      "https://cdn.example/shopfront.jpg",
    );
  });
});
