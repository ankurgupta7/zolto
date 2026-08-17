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
      runPos: {
        useMutation: (opts: MutationOpts) => {
          mocks.posOpts = opts;
          return { mutate: mocks.posMutate, isPending: false };
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
});

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
    act(() =>
      mocks.posOpts!.onSuccess!({
        newPendingReview: 1,
        newNoCandidates: 0,
        scannedLines: 4,
        emailSent: false,
      }),
    );
    expect(
      screen.getByText(
        "1 sale to confirm — but the review email could not be sent.",
      ),
    ).toBeTruthy();
  });

  it("reports a clean POS scan", () => {
    render(<Reconciliation />);
    fireEvent.click(screen.getByText("Confirm in-person sales"));
    act(() =>
      mocks.posOpts!.onSuccess!({
        newPendingReview: 0,
        newNoCandidates: 0,
        scannedLines: 9,
        emailSent: false,
      }),
    );
    expect(
      screen.getByText("No unattributed in-person sales found (9 checked)."),
    ).toBeTruthy();
  });
});
