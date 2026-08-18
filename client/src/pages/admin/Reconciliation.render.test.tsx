import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from "@testing-library/react";
import { toast } from "sonner";
import Reconciliation from "./Reconciliation";

type MutationOpts = {
  onSuccess?: (data: Record<string, number | boolean | string | null>) => void;
  onError?: (e: Error) => void;
};

const mocks = vi.hoisted(() => ({
  authState: { user: { role: "admin" } as { role: string } | null },
  stripeMutate: vi.fn(),
  posMutate: vi.fn(),
  stripeOpts: null as MutationOpts | null,
  posOpts: null as MutationOpts | null,
  stripeData: null as Record<string, unknown> | null,
  posData: null as Record<string, unknown> | null,
  pending: undefined as unknown,
  pendingRefetch: vi.fn(),
  resolveStripeMutate: vi.fn(),
  resolvePosMutate: vi.fn(),
  resolveStripeOpts: null as MutationOpts | null,
  resolvePosOpts: null as MutationOpts | null,
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => mocks.authState }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    reconciliation: {
      run: {
        useMutation: (opts: MutationOpts) => {
          mocks.stripeOpts = opts;
          return {
            mutate: mocks.stripeMutate,
            isPending: false,
            data: mocks.stripeData,
          };
        },
      },
      listPending: {
        useQuery: () => ({
          data: mocks.pending,
          isLoading: false,
          refetch: mocks.pendingRefetch,
        }),
      },
      resolveStripe: {
        useMutation: (opts: MutationOpts) => {
          mocks.resolveStripeOpts = opts;
          return { mutate: mocks.resolveStripeMutate, isPending: false };
        },
      },
      resolvePos: {
        useMutation: (opts: MutationOpts) => {
          mocks.resolvePosOpts = opts;
          return { mutate: mocks.resolvePosMutate, isPending: false };
        },
      },
      runPos: {
        useMutation: (opts: MutationOpts) => {
          mocks.posOpts = opts;
          return {
            mutate: mocks.posMutate,
            isPending: false,
            data: mocks.posData,
          };
        },
      },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authState.user = { role: "admin" };
  mocks.stripeOpts = null;
  mocks.posOpts = null;
  mocks.stripeData = null;
  mocks.posData = null;
  mocks.pending = undefined;
  mocks.resolveStripeOpts = null;
  mocks.resolvePosOpts = null;
});

/** Drives the POS mutation's success path the way tRPC would. */
function posSucceeds(data: Record<string, unknown>) {
  mocks.posData = data;
  act(() =>
    mocks.posOpts!.onSuccess!(
      data as Record<string, number | boolean | string | null>,
    ),
  );
}

/** Drives the Stripe mutation's success path the way tRPC would. */
function stripeSucceeds(data: Record<string, unknown>) {
  mocks.stripeData = data;
  act(() =>
    mocks.stripeOpts!.onSuccess!(
      data as Record<string, number | boolean | string | null>,
    ),
  );
}
afterEach(() => cleanup());

describe("Reconciliation page", () => {
  it("blocks non-admins", () => {
    mocks.authState.user = { role: "staff" };
    render(<Reconciliation />);
    expect(screen.getByText("Admins only")).toBeTruthy();
  });

  it("runs the Stripe scan on click", () => {
    render(<Reconciliation />);
    fireEvent.click(screen.getByText("Reconcile Stripe payments"));
    expect(mocks.stripeMutate).toHaveBeenCalledWith({});
  });

  it("reports payments waiting for a match with the email outcome", () => {
    render(<Reconciliation />);
    fireEvent.click(screen.getByText("Reconcile Stripe payments"));
    stripeSucceeds({
      newPendingReview: 2,
      stillPendingReview: 0,
      totalPendingReview: 2,
      newNoCandidates: 0,
      scannedSucceededPayments: 5,
      emailSent: true,
      emailError: null,
      reviewHtml: null,
    });
    const msg = "2 payments are waiting for a match — a review email was sent.";
    expect(screen.getByText(msg)).toBeTruthy();
    expect(toast.success).toHaveBeenCalledWith(msg);
  });

  // A re-run finds nothing new but still has work outstanding — the count the
  // merchant cares about is what is waiting, not what this scan discovered.
  it("counts payments an earlier run left unconfirmed", () => {
    render(<Reconciliation />);
    fireEvent.click(screen.getByText("Reconcile Stripe payments"));
    stripeSucceeds({
      newPendingReview: 0,
      stillPendingReview: 3,
      totalPendingReview: 3,
      newNoCandidates: 0,
      scannedSucceededPayments: 4,
      emailSent: true,
      emailError: null,
      reviewHtml: null,
    });
    expect(
      screen.getByText(
        "3 payments are waiting for a match — a review email was sent.",
      ),
    ).toBeTruthy();
  });

  // The whole point of returning the HTML: an admin whose mail is broken can
  // still assign each payment, right here.
  it("renders the review page in place when the email could not be sent", () => {
    render(<Reconciliation />);
    fireEvent.click(screen.getByText("Reconcile Stripe payments"));
    stripeSucceeds({
      newPendingReview: 1,
      stillPendingReview: 0,
      totalPendingReview: 1,
      newNoCandidates: 0,
      scannedSucceededPayments: 2,
      emailSent: false,
      emailError: "RESEND_API_KEY is not set on this server",
      reviewHtml: "<p>pick a piece</p>",
    });

    const frame = screen.getByTitle(
      "Payments waiting for a match",
    ) as HTMLIFrameElement;
    expect(frame.getAttribute("srcdoc")).toBe("<p>pick a piece</p>");
    // No allow-scripts / allow-same-origin: the page can submit its confirm
    // form and nothing else.
    expect(frame.getAttribute("sandbox")).toBe("allow-forms");
    expect(
      screen.getByText(
        "Email delivery failed: RESEND_API_KEY is not set on this server",
      ),
    ).toBeTruthy();
    expect(toast.error).toHaveBeenCalledWith(
      "1 payment is waiting for a match — the review email could not be sent, so it is shown below.",
    );
  });

  it("hides the in-place review page on dismiss", () => {
    render(<Reconciliation />);
    fireEvent.click(screen.getByText("Reconcile Stripe payments"));
    stripeSucceeds({
      newPendingReview: 1,
      stillPendingReview: 0,
      totalPendingReview: 1,
      newNoCandidates: 0,
      scannedSucceededPayments: 1,
      emailSent: false,
      emailError: "resend down",
      reviewHtml: "<p>pick a piece</p>",
    });
    fireEvent.click(screen.getByText("Hide this"));
    expect(screen.queryByTitle("Payments waiting for a match")).toBeNull();
  });

  it("reports a clean Stripe scan with the checked count", () => {
    render(<Reconciliation />);
    fireEvent.click(screen.getByText("Reconcile Stripe payments"));
    stripeSucceeds({
      newPendingReview: 0,
      stillPendingReview: 0,
      totalPendingReview: 0,
      newNoCandidates: 0,
      scannedSucceededPayments: 7,
      emailSent: false,
      emailError: null,
      reviewHtml: null,
    });
    expect(
      screen.getByText("No unmatched Stripe payments found (7 checked)."),
    ).toBeTruthy();
    expect(screen.queryByTitle("Payments waiting for a match")).toBeNull();
  });

  it("reports payments found without a price-close candidate", () => {
    render(<Reconciliation />);
    fireEvent.click(screen.getByText("Reconcile Stripe payments"));
    stripeSucceeds({
      newPendingReview: 0,
      stillPendingReview: 0,
      totalPendingReview: 0,
      newNoCandidates: 1,
      scannedSucceededPayments: 3,
      emailSent: false,
      emailError: null,
      reviewHtml: null,
    });
    expect(
      screen.getByText(
        "1 unmatched payment found, but no in-stock piece was close enough in price to guess.",
      ),
    ).toBeTruthy();
  });

  it("surfaces a Stripe scan failure as a toast", () => {
    render(<Reconciliation />);
    fireEvent.click(screen.getByText("Reconcile Stripe payments"));
    act(() => mocks.stripeOpts!.onError!(new Error("Stripe key missing")));
    expect(toast.error).toHaveBeenCalledWith("Stripe key missing");
  });

  it("runs the POS scan on click and reports sales to confirm", () => {
    render(<Reconciliation />);
    fireEvent.click(screen.getByText("Confirm in-person sales"));
    expect(mocks.posMutate).toHaveBeenCalledWith({});
    posSucceeds({
      newPendingReview: 1,
      stillPendingReview: 0,
      totalPendingReview: 1,
      newNoCandidates: 0,
      scannedLines: 4,
      emailSent: true,
      emailError: null,
      reviewHtml: null,
    });
    expect(
      screen.getByText(
        "1 sale is waiting to be confirmed — a review email was sent.",
      ),
    ).toBeTruthy();
  });

  // Same treatment as the Stripe card: an undelivered email is shown rather
  // than reported as a success the merchant cannot act on.
  it("renders the POS review page in place when the email could not be sent", () => {
    render(<Reconciliation />);
    fireEvent.click(screen.getByText("Confirm in-person sales"));
    posSucceeds({
      newPendingReview: 2,
      stillPendingReview: 1,
      totalPendingReview: 3,
      newNoCandidates: 0,
      scannedLines: 4,
      emailSent: false,
      emailError: "RESEND_API_KEY is not set on this server",
      reviewHtml: "<p>which piece was it</p>",
    });

    const frame = screen.getByTitle(
      "Sales waiting to be confirmed",
    ) as HTMLIFrameElement;
    expect(frame.getAttribute("srcdoc")).toBe("<p>which piece was it</p>");
    expect(frame.getAttribute("sandbox")).toBe("allow-forms");
    expect(
      screen.getByText(
        "Email delivery failed: RESEND_API_KEY is not set on this server",
      ),
    ).toBeTruthy();
    expect(toast.error).toHaveBeenCalledWith(
      "3 sales are waiting to be confirmed — the review email could not be sent, so they are shown below.",
    );
  });

  it("hides the in-place POS review page on dismiss", () => {
    render(<Reconciliation />);
    fireEvent.click(screen.getByText("Confirm in-person sales"));
    posSucceeds({
      newPendingReview: 1,
      stillPendingReview: 0,
      totalPendingReview: 1,
      newNoCandidates: 0,
      scannedLines: 1,
      emailSent: false,
      emailError: "resend down",
      reviewHtml: "<p>which piece was it</p>",
    });
    fireEvent.click(screen.getByText("Hide this"));
    expect(screen.queryByTitle("Sales waiting to be confirmed")).toBeNull();
  });

  it("reports a clean POS scan", () => {
    render(<Reconciliation />);
    fireEvent.click(screen.getByText("Confirm in-person sales"));
    posSucceeds({
      newPendingReview: 0,
      stillPendingReview: 0,
      totalPendingReview: 0,
      newNoCandidates: 0,
      scannedLines: 9,
      emailSent: false,
      emailError: null,
      reviewHtml: null,
    });
    expect(
      screen.getByText("No unattributed in-person sales found (9 checked)."),
    ).toBeTruthy();
    expect(screen.queryByTitle("Sales waiting to be confirmed")).toBeNull();
  });
});

// The durable queue: always on the page, no email and no token involved. The
// review-email panel above it is the rescue for a scan that has just failed to
// send; this is what is there the next morning either way.
describe("Reconciliation page — pending queue", () => {
  const candidates = [
    { id: 7, name: "Silberring", nameEn: "Silver Ring", price: "120.00" },
    { id: 8, name: "Milchkrug", nameEn: null, price: "45.00" },
  ];

  const queue = {
    stripe: [
      {
        id: 3,
        stripePaymentIntentId: "pi_3PqL2mB",
        amountRappen: 12000,
        currency: "chf",
        stripeCreatedAt: new Date("2026-08-14T16:05:00Z"),
        candidates,
      },
    ],
    pos: [
      {
        id: 5,
        posOrderItemId: 900,
        amountRappen: 4500,
        soldAt: new Date("2026-08-16T11:20:00Z"),
        itemLabel: "Custom",
        // A piece of its own, so an assertion about this list cannot be
        // satisfied by a row in the Stripe one above it.
        candidates: [
          { id: 9, name: "Knospenvase", nameEn: "Bud vase", price: "42.00" },
        ],
      },
    ],
  };

  it("shows nothing when the queue is empty", () => {
    mocks.pending = { stripe: [], pos: [] };
    render(<Reconciliation />);
    expect(screen.queryByText("Payments still waiting")).toBeNull();
    expect(screen.queryByText("Sales still waiting")).toBeNull();
  });

  it("lists each outstanding payment with its candidate pieces", () => {
    mocks.pending = queue;
    render(<Reconciliation />);

    expect(screen.getByText("Payments still waiting")).toBeTruthy();
    expect(
      screen.getByText(
        "Stripe payment pi_3PqL2mB, with no matching order or in-person sale.",
      ),
    ).toBeTruthy();
    // English name preferred, local name as the fallback.
    expect(screen.getByText("Silver Ring")).toBeTruthy();
    expect(screen.getByText("Milchkrug")).toBeTruthy();
  });

  it("assigns a payment to the piece the merchant picks", () => {
    mocks.pending = queue;
    render(<Reconciliation />);

    fireEvent.click(screen.getByText("Silver Ring"));
    expect(mocks.resolveStripeMutate).toHaveBeenCalledWith({
      id: 3,
      productId: 7,
    });
  });

  it("sends a null productId for 'none of these'", () => {
    mocks.pending = { stripe: queue.stripe, pos: [] };
    render(<Reconciliation />);

    fireEvent.click(screen.getByText("None of these"));
    expect(mocks.resolveStripeMutate).toHaveBeenCalledWith({
      id: 3,
      productId: null,
    });
  });

  it("lists in-person sales with the label typed at the till", () => {
    mocks.pending = queue;
    render(<Reconciliation />);

    expect(screen.getByText("Sales still waiting")).toBeTruthy();
    expect(
      screen.getByText("Rung up as “Custom” with no piece attached."),
    ).toBeTruthy();
  });

  it("attributes an in-person sale to the chosen piece", () => {
    mocks.pending = { stripe: [], pos: queue.pos };
    render(<Reconciliation />);

    fireEvent.click(screen.getByText("Bud vase"));
    expect(mocks.resolvePosMutate).toHaveBeenCalledWith({
      id: 5,
      productId: 9,
    });
  });

  // The row is gone from the queue the moment it is decided; leaving it on
  // screen invites a second click on a decision already applied.
  it("refreshes the queue and confirms what changed", () => {
    mocks.pending = queue;
    render(<Reconciliation />);

    act(() =>
      mocks.resolveStripeOpts!.onSuccess!({
        productName: "Silver Ring",
        amountRappen: 12000,
      } as never),
    );

    expect(mocks.pendingRefetch).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(
      "CHF 120.00 recorded as a sale of Silver Ring. Inventory updated.",
    );
  });

  it("says plainly when a payment is set aside instead", () => {
    mocks.pending = queue;
    render(<Reconciliation />);

    act(() =>
      mocks.resolveStripeOpts!.onSuccess!({
        productName: null,
        amountRappen: 12000,
      } as never),
    );

    expect(toast.success).toHaveBeenCalledWith(
      "Left for you to sort out. Inventory unchanged.",
    );
  });

  it("surfaces a refused decision as a toast", () => {
    mocks.pending = queue;
    render(<Reconciliation />);

    act(() =>
      mocks.resolvePosOpts!.onError!(
        new Error("That piece is already marked sold or out of stock."),
      ),
    );

    expect(toast.error).toHaveBeenCalledWith(
      "That piece is already marked sold or out of stock.",
    );
  });

  it("refreshes the queue after a scan", () => {
    mocks.pending = { stripe: [], pos: [] };
    render(<Reconciliation />);
    fireEvent.click(screen.getByText("Reconcile Stripe payments"));
    stripeSucceeds({
      newPendingReview: 1,
      stillPendingReview: 0,
      totalPendingReview: 1,
      newNoCandidates: 0,
      scannedSucceededPayments: 2,
      emailSent: true,
      emailError: null,
      reviewHtml: null,
    });
    expect(mocks.pendingRefetch).toHaveBeenCalled();
  });
});
