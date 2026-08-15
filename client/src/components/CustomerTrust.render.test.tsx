import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import i18n from "@/lib/i18n";
import CustomerTrust, { initialsOf } from "./CustomerTrust";

const mocks = vi.hoisted(() => ({
  testimonials: [] as Record<string, unknown>[],
  trustpilot: undefined as Record<string, unknown> | undefined,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    testimonials: { list: { useQuery: () => ({ data: mocks.testimonials }) } },
    trustpilot: { summary: { useQuery: () => ({ data: mocks.trustpilot }) } },
  },
}));

// The section fades in on scroll (framer-motion `whileInView`), which needs an
// IntersectionObserver jsdom doesn't implement. The stub never fires, so every
// element below is asserted in its pre-animation state — present in the DOM,
// which is the part these tests are about. What it LOOKS like is a screenshot's
// job, not a DOM assertion's (CLAUDE.md).
class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
vi.stubGlobal("IntersectionObserver", ObserverStub);

const QUOTE = {
  id: 1,
  authorName: "Anna Müller",
  authorTitle: "Zürich",
  authorPhotoUrl: null,
  quote: "The ring arrived beautifully wrapped.",
  rating: 5,
  source: "manual" as const,
};

const RATED = {
  connected: true,
  domain: "kalakosh.ch",
  profileUrl: "https://ch.trustpilot.com/review/kalakosh.ch",
  reviewUrl: "https://ch.trustpilot.com/evaluate/kalakosh.ch",
  summary: {
    domain: "kalakosh.ch",
    displayName: "Kalakosh",
    stars: 4.5,
    trustScore: 4.6,
    numberOfReviews: 128,
    profileUrl: "https://ch.trustpilot.com/review/kalakosh.ch",
  },
};

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("en");
  mocks.testimonials = [];
  mocks.trustpilot = { connected: false };
});
afterEach(() => cleanup());

describe("initialsOf", () => {
  it("takes the first and last initial", () => {
    expect(initialsOf("Anna Müller")).toBe("AM");
    expect(initialsOf("Anna Marie Müller")).toBe("AM");
  });

  it("handles a single name and an abbreviated surname", () => {
    expect(initialsOf("Anna")).toBe("A");
    expect(initialsOf("Anna M.")).toBe("AM");
  });

  it("never renders empty", () => {
    expect(initialsOf("")).toBe("?");
    expect(initialsOf("   ")).toBe("?");
    expect(initialsOf("!!!")).toBe("?");
  });
});

describe("CustomerTrust", () => {
  // The whole feature has to be invisible to a store that never opened these
  // admin pages — an empty heading over white space reads as "coming soon".
  it("renders nothing for a store with no quotes and no Trustpilot profile", () => {
    const { container } = render(<CustomerTrust />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing while the queries are still in flight", () => {
    mocks.trustpilot = undefined;
    const { container } = render(<CustomerTrust />);
    expect(container.innerHTML).toBe("");
  });

  it("shows a published quote with its author and rating", () => {
    mocks.testimonials = [QUOTE];
    render(<CustomerTrust />);
    expect(
      screen.getByText(/The ring arrived beautifully wrapped\./),
    ).toBeTruthy();
    expect(screen.getByText("Anna Müller")).toBeTruthy();
    expect(screen.getByText("Zürich")).toBeTruthy();
    expect(screen.getByRole("img", { name: "5 out of 5" })).toBeTruthy();
  });

  it("falls back to the author's initials when no photo was supplied", () => {
    mocks.testimonials = [QUOTE];
    render(<CustomerTrust />);
    expect(screen.getByText("AM")).toBeTruthy();
    expect(document.querySelector("figcaption img")).toBeNull();
  });

  it("shows the customer's photo when there is one", () => {
    mocks.testimonials = [
      { ...QUOTE, authorPhotoUrl: "https://cdn.example.ch/anna.jpg" },
    ];
    render(<CustomerTrust />);
    const img = document.querySelector("figcaption img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("https://cdn.example.ch/anna.jpg");
    // Decorative: the name is already read out beside it.
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("loading")).toBe("lazy");
  });

  it("names the source of a quote that came from Google", () => {
    mocks.testimonials = [{ ...QUOTE, source: "google" }];
    render(<CustomerTrust />);
    expect(screen.getByText("Zürich · via Google")).toBeTruthy();
  });

  it("says nothing about provenance for a quote the merchant typed in", () => {
    mocks.testimonials = [QUOTE];
    render(<CustomerTrust />);
    expect(screen.queryByText(/via /)).toBeNull();
  });

  it("omits the stars for a quote that carried no rating", () => {
    mocks.testimonials = [{ ...QUOTE, rating: null }];
    render(<CustomerTrust />);
    expect(screen.queryByRole("img", { name: /out of 5/ })).toBeNull();
  });

  describe("Trustpilot", () => {
    it("shows the score, the review count and a link to the profile", () => {
      mocks.trustpilot = RATED;
      render(<CustomerTrust />);
      const link = screen.getByRole("link") as HTMLAnchorElement;
      expect(link.getAttribute("href")).toBe(
        "https://ch.trustpilot.com/review/kalakosh.ch",
      );
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
      expect(within(link).getByText("4.6")).toBeTruthy();
      expect(within(link).getByText("128 reviews")).toBeTruthy();
    });

    // Cormorant Garamond defaults to oldstyle figures, which renders 4.6 with
    // a dropped 4 and reads as a rendering fault next to the same number on
    // Trustpilot's own badge.
    it("sets lining figures on the serif score", () => {
      mocks.trustpilot = RATED;
      render(<CustomerTrust />);
      const score = screen.getByText("4.6");
      expect(score.className).toContain("lining-nums");
    });

    it("rounds the stars the way Trustpilot rounds them", () => {
      mocks.trustpilot = RATED;
      render(<CustomerTrust />);
      expect(
        screen.getByRole("img", { name: "Rated 4.6 out of 5 on Trustpilot" }),
      ).toBeTruthy();
    });

    it("singularises a lone review", () => {
      mocks.trustpilot = {
        ...RATED,
        summary: { ...RATED.summary, numberOfReviews: 1 },
      };
      render(<CustomerTrust />);
      expect(screen.getByText("1 review")).toBeTruthy();
    });

    // The rating needs a platform API key; the link needs nothing. A store that
    // connected a profile must not lose its link because Trustpilot is down.
    it("still links to the profile when no rating could be fetched", () => {
      mocks.trustpilot = { ...RATED, summary: null };
      render(<CustomerTrust />);
      const link = screen.getByRole("link") as HTMLAnchorElement;
      expect(link.getAttribute("href")).toBe(
        "https://ch.trustpilot.com/review/kalakosh.ch",
      );
      expect(within(link).getByText("Read our reviews")).toBeTruthy();
    });

    it("renders the band on its own when the store has no quotes yet", () => {
      mocks.trustpilot = RATED;
      render(<CustomerTrust />);
      expect(screen.getByRole("link")).toBeTruthy();
      expect(document.querySelector("blockquote")).toBeNull();
    });

    // No third-party embed: a Trustpilot widget would put their script on every
    // storefront on the platform.
    it("loads no third-party script", () => {
      mocks.trustpilot = RATED;
      const { container } = render(<CustomerTrust />);
      expect(container.querySelector("script")).toBeNull();
      expect(container.querySelector("iframe")).toBeNull();
    });
  });

  it("shows both sources together", () => {
    mocks.testimonials = [QUOTE, { ...QUOTE, id: 2, authorName: "Beat Suter" }];
    mocks.trustpilot = RATED;
    render(<CustomerTrust />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("link")).toBeTruthy();
  });

  it("translates the section into the storefront's language", async () => {
    mocks.testimonials = [QUOTE];
    await i18n.changeLanguage("de");
    render(<CustomerTrust />);
    expect(
      screen.getByRole("heading", {
        name: "Was unsere Kundinnen und Kunden sagen",
      }),
    ).toBeTruthy();
  });
});
