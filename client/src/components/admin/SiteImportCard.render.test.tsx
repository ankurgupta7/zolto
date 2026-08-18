import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  status: undefined as unknown,
  preview: { data: undefined as unknown, isPending: false },
  stored: { data: undefined as unknown },
  applyResult: { data: undefined as unknown, isPending: false },
  previewMutate: vi.fn(),
  checkoutMutate: vi.fn(),
  applyMutate: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      siteImport: { status: { invalidate: vi.fn() } },
      products: { invalidate: vi.fn() },
    }),
    siteImport: {
      status: { useQuery: () => ({ data: mocks.status, isLoading: false }) },
      get: { useQuery: () => ({ data: mocks.stored.data }) },
      preview: {
        useMutation: () => ({
          mutate: mocks.previewMutate,
          data: mocks.preview.data,
          isPending: mocks.preview.isPending,
          reset: vi.fn(),
        }),
      },
      startCheckout: {
        useMutation: () => ({ mutate: mocks.checkoutMutate, isPending: false }),
      },
      applyImport: {
        useMutation: () => ({
          mutate: mocks.applyMutate,
          data: mocks.applyResult.data,
          isPending: mocks.applyResult.isPending,
          reset: vi.fn(),
        }),
      },
    },
  },
}));

import SiteImportCard from "./SiteImportCard";

const OFFER = {
  priceChf: 20,
  name: "Bring your old shop with you",
  summary: "Point us at the site you sell on today.",
  whyPaid: "Reading a whole shop takes real machine time.",
  includes: [],
  caveat: "Some shops hide their catalogue behind scripts we can't read.",
};

function previewResult(over: Record<string, unknown> = {}) {
  return {
    importId: 5,
    pagesRead: 12,
    priceChf: 20,
    productCount: 3,
    pricedCount: 2,
    withPhoto: 3,
    categories: ["Tableware"],
    profile: { logoUrl: "https://old.example/logo.png" },
    warnings: [],
    has: {
      logo: true,
      brandColour: false,
      shopProfile: true,
      categories: true,
    },
    products: [
      { name: "Stoneware mug", price: 42, currency: "CHF" },
      { name: "Linen apron", price: 65, currency: "CHF" },
      { name: "Mystery box", price: null },
    ],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/admin/import");
  mocks.status = { offer: OFFER, checkoutAvailable: true, latest: null };
  mocks.preview = { data: undefined, isPending: false };
  mocks.stored = { data: undefined };
  mocks.applyResult = { data: undefined, isPending: false };
});
afterEach(() => cleanup());

describe("SiteImportCard — before a preview", () => {
  it("offers the free read and never a price without a result behind it", () => {
    render(<SiteImportCard />);
    expect(screen.getByText("Bring your old shop with you")).toBeTruthy();
    expect(screen.getByText("See what we can bring over")).toBeTruthy();
    // The badge states the price; the Pay button must not exist yet, because
    // there is nothing found to pay for.
    expect(screen.getByText("CHF 20, once")).toBeTruthy();
    expect(screen.queryByText("Pay CHF 20 and import")).toBeNull();
  });

  it("says plainly that reading the site costs nothing", () => {
    render(<SiteImportCard />);
    expect(screen.getByText(/Reading your site is free/i)).toBeTruthy();
  });

  it("will not run an empty crawl", () => {
    render(<SiteImportCard />);
    const button = screen.getByText("See what we can bring over");
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(mocks.previewMutate).not.toHaveBeenCalled();
  });

  it("sends the typed address to the free preview", () => {
    render(<SiteImportCard />);
    fireEvent.change(screen.getByLabelText("Your current shop address"), {
      target: { value: " https://old.example " },
    });
    fireEvent.click(screen.getByText("See what we can bring over"));
    expect(mocks.previewMutate).toHaveBeenCalledWith({
      url: "https://old.example",
    });
  });
});

describe("SiteImportCard — after a preview", () => {
  beforeEach(() => {
    mocks.preview.data = previewResult();
  });

  it("shows what was found before asking for money", () => {
    render(<SiteImportCard />);
    expect(screen.getByText("products found")).toBeTruthy();
    expect(screen.getByText("Stoneware mug")).toBeTruthy();
    expect(screen.getByText("CHF 42")).toBeTruthy();
    expect(screen.getByText("Pay CHF 20 and import")).toBeTruthy();
  });

  it("marks a product we could not price rather than showing it as free", () => {
    render(<SiteImportCard />);
    expect(screen.getByText("no price found")).toBeTruthy();
    // "CHF 0" next to a product name would read as a giveaway.
    expect(screen.queryByText("CHF 0")).toBeNull();
  });

  it("gives the reason for the charge next to the button that asks for it", () => {
    render(<SiteImportCard />);
    expect(
      screen.getByText(
        /never a monthly fee for keeping what is already yours/i,
      ),
    ).toBeTruthy();
    // The prose is translated, NOT read off the server's SITE_IMPORT constant
    // — that constant is English-only marketing copy, and rendering it here
    // left a German merchant looking at an English card.
    expect(screen.queryByText(OFFER.whyPaid)).toBeNull();
  });

  it("starts checkout for the previewed import", () => {
    render(<SiteImportCard />);
    fireEvent.click(screen.getByText("Pay CHF 20 and import"));
    expect(mocks.checkoutMutate).toHaveBeenCalledWith({ importId: 5 });
  });

  it("does not offer a dead Pay button when the deployment can't charge", () => {
    mocks.status = { offer: OFFER, checkoutAvailable: false, latest: null };
    render(<SiteImportCard />);
    expect(
      (
        screen
          .getByText("Pay CHF 20 and import")
          .closest("button") as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByText(/not set up on this deployment/i)).toBeTruthy();
  });

  it("disables the pieces the crawl did not find, so nothing promises what it can't do", () => {
    render(<SiteImportCard />);
    const toggle = (label: string) =>
      screen
        .getByText(label)
        .closest("label")!
        .querySelector("input") as HTMLInputElement;
    expect(toggle("Categories").disabled).toBe(false);
    expect(toggle("Shop details").disabled).toBe(false);
    // has.logo is true and has.brandColour false — one of the two is enough.
    expect(toggle("Logo & colour").disabled).toBe(false);
  });

  it("greys out branding entirely when neither a logo nor a colour was found", () => {
    mocks.preview.data = previewResult({
      has: {
        logo: false,
        brandColour: false,
        shopProfile: true,
        categories: true,
      },
    });
    render(<SiteImportCard />);
    const input = screen
      .getByText("Logo & colour")
      .closest("label")!
      .querySelector("input") as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(
      screen.getAllByText("Nothing we could read on that site").length,
    ).toBe(1);
  });

  it("shows the crawl's own warnings rather than a clean-looking empty result", () => {
    mocks.preview.data = previewResult({
      productCount: 0,
      pricedCount: 0,
      withPhoto: 0,
      products: [],
      categories: [],
      has: {
        logo: false,
        brandColour: false,
        shopProfile: false,
        categories: false,
      },
      warnings: ["We couldn't find any products we could read on that site."],
    });
    render(<SiteImportCard />);
    expect(
      screen.getByText(/couldn't find any products we could read/i),
    ).toBeTruthy();
    // Nothing found means nothing to sell them.
    expect(screen.queryByText("Pay CHF 20 and import")).toBeNull();
    expect(
      screen.getByText(/nothing here worth charging you for/i),
    ).toBeTruthy();
  });
});

describe("SiteImportCard — returning from Stripe", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/admin/import?imported=5");
    mocks.stored.data = { ...previewResult(), status: "paid" };
  });

  it("offers the import once the payment has actually been recorded", () => {
    render(<SiteImportCard />);
    expect(screen.getByText(/Payment received/i)).toBeTruthy();
    expect(screen.queryByText("Pay CHF 20 and import")).toBeNull();
    fireEvent.click(screen.getByText("Add to my shop"));
    expect(mocks.applyMutate).toHaveBeenCalledWith({
      importId: 5,
      categories: true,
      branding: true,
      profile: true,
    });
  });

  it("puts the finish-what-you-paid-for button above the form, not below the list", () => {
    // At 390px the URL form plus the counts plus the product list pushed this
    // a screen and a half down, so a merchant back from Stripe saw only the
    // step they had already done. Source order is what fixes that, so it is
    // what this pins.
    render(<SiteImportCard />);
    const action = screen.getByText("Add to my shop");
    const form = screen.getByLabelText("Your current shop address");
    expect(
      action.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("offers exactly one button for the job once paid", () => {
    render(<SiteImportCard />);
    expect(screen.getAllByText("Add to my shop")).toHaveLength(1);
  });

  it("passes the merchant's opt-outs through to the write", () => {
    render(<SiteImportCard />);
    fireEvent.click(
      screen
        .getByText("Logo & colour")
        .closest("label")!
        .querySelector("input")!,
    );
    fireEvent.click(screen.getByText("Add to my shop"));
    expect(mocks.applyMutate).toHaveBeenCalledWith({
      importId: 5,
      categories: true,
      branding: false,
      profile: true,
    });
  });

  it("still asks for payment when the webhook has not confirmed it", () => {
    // The success URL is a plain link a merchant can type; only the row's
    // status decides whether the import can be applied.
    mocks.stored.data = { ...previewResult(), status: "previewed" };
    render(<SiteImportCard />);
    expect(screen.queryByText("Add to my shop")).toBeNull();
    expect(screen.getByText("Pay CHF 20 and import")).toBeTruthy();
  });
});

describe("SiteImportCard — after importing", () => {
  beforeEach(() => {
    mocks.preview.data = previewResult();
    mocks.applyResult.data = {
      productsCreated: 2,
      productsUpdated: 1,
      productsFailed: ["Mystery box"],
      hiddenPending: 1,
      categoriesCreated: ["Tableware"],
      brandingApplied: true,
      profileApplied: true,
    };
  });

  it("reports what landed, in the merchant's own terms", () => {
    render(<SiteImportCard />);
    expect(
      screen.getByText("Done — 2 products added, 1 updated."),
    ).toBeTruthy();
  });

  it("says which products arrived hidden and why", () => {
    render(<SiteImportCard />);
    expect(
      screen.getByText(/1 arrived hidden because we could not read a price/i),
    ).toBeTruthy();
  });

  it("names the rows that failed instead of quietly dropping them", () => {
    render(<SiteImportCard />);
    expect(screen.getByText(/Mystery box/)).toBeTruthy();
  });
});
