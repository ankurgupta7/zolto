import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import Testimonials from "./Testimonials";

const mocks = vi.hoisted(() => ({
  meData: { slug: "kalakosh", name: "Kalakosh" } as Record<string, unknown>,
  settingsData: {} as Record<string, unknown> | null,
  statusData: {} as Record<string, unknown> | undefined,
  listData: [] as Record<string, unknown>[],
  saveSettings: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  setPublished: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      tenant: {
        me: { invalidate: vi.fn() },
        getSettings: { invalidate: vi.fn() },
      },
      trustpilot: { status: { invalidate: vi.fn() } },
      testimonials: {
        adminList: { invalidate: vi.fn() },
        list: { invalidate: vi.fn() },
      },
    }),
    tenant: {
      me: { useQuery: () => ({ data: mocks.meData, isLoading: false }) },
      getSettings: {
        useQuery: () => ({ data: mocks.settingsData, isLoading: false }),
      },
      updateSettings: {
        useMutation: () => ({ mutate: mocks.saveSettings, isPending: false }),
      },
    },
    trustpilot: {
      status: { useQuery: () => ({ data: mocks.statusData }) },
    },
    testimonials: {
      adminList: {
        useQuery: () => ({ data: mocks.listData, isLoading: false }),
      },
      create: {
        useMutation: () => ({ mutate: mocks.create, isPending: false }),
      },
      update: {
        useMutation: () => ({ mutate: mocks.update, isPending: false }),
      },
      setPublished: {
        useMutation: () => ({ mutate: mocks.setPublished, isPending: false }),
      },
      delete: {
        useMutation: () => ({ mutate: mocks.remove, isPending: false }),
      },
    },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { toast } from "sonner";

const ROW = {
  id: 3,
  authorName: "Anna Müller",
  authorTitle: "Zürich",
  authorPhotoUrl: null,
  googleId: null,
  quote: "The ring arrived beautifully wrapped.",
  rating: 5,
  source: "manual" as const,
  published: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.settingsData = {};
  mocks.statusData = { ratingsAvailable: true, domain: null, summary: null };
  mocks.listData = [];
});
afterEach(() => cleanup());

describe("Reviews page — Trustpilot", () => {
  it("offers a field to paste a profile link into", () => {
    render(<Testimonials />);
    expect(screen.getByLabelText(/Trustpilot profile or domain/i)).toBeTruthy();
  });

  it("prefills the connected domain", () => {
    mocks.settingsData = { trustpilotDomain: "kalakosh.ch" };
    render(<Testimonials />);
    expect(screen.getByDisplayValue("kalakosh.ch")).toBeTruthy();
  });

  it("saves what the merchant pasted, unparsed — the server normalises it", () => {
    render(<Testimonials />);
    fireEvent.change(screen.getByLabelText(/Trustpilot profile or domain/i), {
      target: { value: "https://ch.trustpilot.com/review/kalakosh.ch" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mocks.saveSettings).toHaveBeenCalledWith({
      trustpilotDomain: "https://ch.trustpilot.com/review/kalakosh.ch",
    });
  });

  // Emptying the box is how a merchant disconnects; "" would be stored as a
  // blank domain that renders a dead link.
  it("sends null when the field is emptied", () => {
    mocks.settingsData = { trustpilotDomain: "kalakosh.ch" };
    render(<Testimonials />);
    fireEvent.change(screen.getByLabelText(/Trustpilot profile or domain/i), {
      target: { value: "  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mocks.saveSettings).toHaveBeenCalledWith({ trustpilotDomain: null });
  });

  it("shows the live rating once a profile is connected", () => {
    mocks.statusData = {
      ratingsAvailable: true,
      domain: "kalakosh.ch",
      showRating: true,
      profileUrl: "https://ch.trustpilot.com/review/kalakosh.ch",
      summary: { trustScore: 4.6, numberOfReviews: 128, stars: 4.5 },
    };
    render(<Testimonials />);
    expect(screen.getByText("4.6")).toBeTruthy();
    expect(screen.getByText("128 reviews")).toBeTruthy();
  });

  // The merchant must be able to tell "your profile is wrong" apart from
  // "this installation can't fetch ratings at all".
  it("explains an empty rating when the platform has no Trustpilot key", () => {
    mocks.statusData = {
      ratingsAvailable: false,
      domain: "kalakosh.ch",
      showRating: true,
      profileUrl: "https://ch.trustpilot.com/review/kalakosh.ch",
      summary: null,
    };
    render(<Testimonials />);
    expect(
      screen.getByText(/aren't available on this installation/i),
    ).toBeTruthy();
  });

  it("explains an empty rating when nobody has reviewed the store yet", () => {
    mocks.statusData = {
      ratingsAvailable: true,
      domain: "kalakosh.ch",
      showRating: true,
      profileUrl: "https://ch.trustpilot.com/review/kalakosh.ch",
      summary: null,
    };
    render(<Testimonials />);
    expect(screen.getByText(/No reviews on Trustpilot yet/i)).toBeTruthy();
  });

  it("offers the show-rating switch only once a profile is connected", () => {
    render(<Testimonials />);
    expect(screen.queryByLabelText(/Show the star rating/i)).toBeNull();

    cleanup();
    mocks.statusData = {
      ratingsAvailable: true,
      domain: "kalakosh.ch",
      showRating: true,
      profileUrl: "https://ch.trustpilot.com/review/kalakosh.ch",
      summary: null,
    };
    render(<Testimonials />);
    fireEvent.click(screen.getByLabelText(/Show the star rating/i));
    expect(mocks.saveSettings).toHaveBeenCalledWith({
      trustpilotShowRating: false,
    });
  });
});

describe("Reviews page — quotes", () => {
  it("shows an empty state before any quote exists", () => {
    render(<Testimonials />);
    expect(screen.getByText("No quotes yet")).toBeTruthy();
  });

  it("lists an existing quote with its author", () => {
    mocks.listData = [ROW];
    render(<Testimonials />);
    expect(
      screen.getByText(/The ring arrived beautifully wrapped\./),
    ).toBeTruthy();
    expect(screen.getByText(/Anna Müller · Zürich · 5 stars/)).toBeTruthy();
  });

  it("creates a quote from the form", () => {
    render(<Testimonials />);
    fireEvent.click(screen.getByRole("button", { name: /Add quote/ }));
    fireEvent.change(screen.getByLabelText("Customer name"), {
      target: { value: "Anna Müller" },
    });
    fireEvent.change(screen.getByLabelText("What they said"), {
      target: { value: "Lovely work." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add quote" }));
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        authorName: "Anna Müller",
        quote: "Lovely work.",
        published: true,
      }),
    );
  });

  // Emptying an optional box must clear the stored value, not leave the old
  // one in place — hence null rather than undefined.
  it("clears an emptied optional field to null", () => {
    render(<Testimonials />);
    fireEvent.click(screen.getByRole("button", { name: /Add quote/ }));
    fireEvent.change(screen.getByLabelText("Customer name"), {
      target: { value: "Anna" },
    });
    fireEvent.change(screen.getByLabelText("What they said"), {
      target: { value: "Lovely." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add quote" }));
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        authorTitle: null,
        authorPhotoUrl: null,
        googleId: null,
        rating: null,
      }),
    );
  });

  it("refuses a quote with no words, without calling the server", () => {
    render(<Testimonials />);
    fireEvent.click(screen.getByRole("button", { name: /Add quote/ }));
    fireEvent.change(screen.getByLabelText("Customer name"), {
      target: { value: "Anna" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add quote" }));
    expect(mocks.create).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it("refuses a photo that isn't a URL", () => {
    render(<Testimonials />);
    fireEvent.click(screen.getByRole("button", { name: /Add quote/ }));
    fireEvent.change(screen.getByLabelText("Customer name"), {
      target: { value: "Anna" },
    });
    fireEvent.change(screen.getByLabelText("What they said"), {
      target: { value: "Lovely." },
    });
    fireEvent.change(screen.getByLabelText("Photo URL"), {
      target: { value: "anna.jpg" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add quote" }));
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("edits an existing quote in place rather than creating a second one", () => {
    mocks.listData = [ROW];
    render(<Testimonials />);
    fireEvent.click(screen.getByLabelText("Edit Anna Müller's quote"));
    fireEvent.change(screen.getByLabelText("What they said"), {
      target: { value: "Rewritten." },
    });
    // "Save quote", not "Save" — the Trustpilot card above has its own Save,
    // and two identically named buttons on one page are ambiguous.
    fireEvent.click(screen.getByRole("button", { name: "Save quote" }));
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 3, quote: "Rewritten." }),
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("takes a quote off the storefront without deleting it", () => {
    mocks.listData = [ROW];
    render(<Testimonials />);
    fireEvent.click(
      screen.getByLabelText("Show Anna Müller's quote on the storefront"),
    );
    expect(mocks.setPublished).toHaveBeenCalledWith({
      id: 3,
      published: false,
    });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("deletes a quote", () => {
    mocks.listData = [ROW];
    render(<Testimonials />);
    fireEvent.click(screen.getByLabelText("Delete Anna Müller's quote"));
    expect(mocks.remove).toHaveBeenCalledWith({ id: 3 });
  });
});
