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
  onSuccess?: (data: Record<string, number | boolean>) => void;
  onError?: (e: Error) => void;
};

const mocks = vi.hoisted(() => ({
  authState: { user: { role: "admin" } as { role: string } | null },
  stripeMutate: vi.fn(),
  posMutate: vi.fn(),
  stripeOpts: null as MutationOpts | null,
  posOpts: null as MutationOpts | null,
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => mocks.authState }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    reconciliation: {
      run: {
        useMutation: (opts: MutationOpts) => {
          mocks.stripeOpts = opts;
          return { mutate: mocks.stripeMutate, isPending: false };
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
});
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

  it("reports unmatched Stripe payments with the email outcome", () => {
    render(<Reconciliation />);
    fireEvent.click(screen.getByText("Reconcile Stripe payments"));
    act(() =>
      mocks.stripeOpts!.onSuccess!({
        newPendingReview: 2,
        newNoCandidates: 0,
        scannedSucceededPayments: 5,
        emailSent: true,
      }),
    );
    const msg = "2 unmatched payments found — a review email was sent.";
    expect(screen.getByText(msg)).toBeTruthy();
    expect(toast.success).toHaveBeenCalledWith(msg);
  });

  it("reports a clean Stripe scan with the checked count", () => {
    render(<Reconciliation />);
    fireEvent.click(screen.getByText("Reconcile Stripe payments"));
    act(() =>
      mocks.stripeOpts!.onSuccess!({
        newPendingReview: 0,
        newNoCandidates: 0,
        scannedSucceededPayments: 7,
        emailSent: false,
      }),
    );
    expect(
      screen.getByText("No unmatched Stripe payments found (7 checked)."),
    ).toBeTruthy();
  });

  it("reports payments found without a price-close candidate", () => {
    render(<Reconciliation />);
    fireEvent.click(screen.getByText("Reconcile Stripe payments"));
    act(() =>
      mocks.stripeOpts!.onSuccess!({
        newPendingReview: 0,
        newNoCandidates: 1,
        scannedSucceededPayments: 3,
        emailSent: false,
      }),
    );
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
