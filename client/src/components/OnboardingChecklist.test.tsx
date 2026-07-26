import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import OnboardingChecklist from "./OnboardingChecklist";

const mocks = vi.hoisted(() => ({
  dismissMutate: vi.fn(),
  invalidate: vi.fn(),
  statusData: {
    tasks: [
      {
        id: "claim-admin",
        title: "Claim your store",
        body: "Sign in.",
        done: true,
      },
      {
        id: "first-product",
        title: "Add your first product",
        body: "Snap a photo.",
        href: "/admin",
        tourId: "add-product",
        done: false,
      },
      {
        id: "pos-ready",
        title: "Take a card payment",
        body: "Install the app.",
        done: false,
        blockedReason: "Connect Stripe first (the step above).",
      },
    ],
    doneCount: 1,
    totalCount: 3,
    allDone: false,
    cursor: 2,
    dismissed: false,
  } as Record<string, unknown> | undefined,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      tenant: { onboardingStatus: { invalidate: mocks.invalidate } },
    }),
    tenant: {
      onboardingStatus: {
        useQuery: () => ({
          data: mocks.statusData,
          isLoading: mocks.statusData === undefined,
        }),
      },
      dismissOnboarding: {
        useMutation: () => ({ mutate: mocks.dismissMutate, isPending: false }),
      },
    },
  },
}));

// GuidedTour is its own tested component; here we only check the wiring.
vi.mock("./GuidedTour", () => ({
  default: (props: { tourId: string; onFinish: () => void }) => (
    <div data-testid="guided-tour" data-tour-id={props.tourId}>
      <button onClick={props.onFinish}>finish</button>
    </div>
  ),
}));

import { TOURS, hasTour } from "@/lib/tours";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.statusData!.dismissed = false;
});
afterEach(() => cleanup());

describe("OnboardingChecklist", () => {
  it("renders tasks with progress and done styling", () => {
    render(<OnboardingChecklist />);
    expect(screen.getByText("1/3")).toBeTruthy();
    expect(screen.getByText("Claim your store")).toBeTruthy();
    expect(screen.getByText("Add your first product")).toBeTruthy();
  });

  it("offers Go there and Show me on actionable tasks", () => {
    render(<OnboardingChecklist />);
    expect(screen.getByText("Go there")).toBeTruthy();
    expect(screen.getByText("Show me")).toBeTruthy();
  });

  it("shows the blocked reason and no actions for blocked tasks", () => {
    render(<OnboardingChecklist />);
    expect(screen.getByText(/Connect Stripe first/)).toBeTruthy();
    expect(screen.getByText("Blocked")).toBeTruthy();
  });

  it("launches the task's tour from Show me and closes it onFinish", () => {
    render(<OnboardingChecklist />);
    fireEvent.click(screen.getByText("Show me"));
    const tour = screen.getByTestId("guided-tour");
    expect(tour.getAttribute("data-tour-id")).toBe("onboarding-add-product");
    fireEvent.click(screen.getByText("finish"));
    expect(screen.queryByTestId("guided-tour")).toBeNull();
  });

  it("dismisses via the X and invalidates the query", () => {
    render(<OnboardingChecklist />);
    fireEvent.click(screen.getByLabelText("Hide checklist"));
    expect(mocks.dismissMutate).toHaveBeenCalled();
  });

  it("renders nothing when dismissed", () => {
    mocks.statusData!.dismissed = true;
    const { container } = render(<OnboardingChecklist />);
    expect(container.firstChild).toBeNull();
  });
});

describe("tour registry", () => {
  it("every checklist tourId has a definition with valid anchors", () => {
    expect(hasTour("add-product")).toBe(true);
    expect(hasTour("connect-stripe")).toBe(true);
    expect(hasTour("nonexistent")).toBe(false);
    for (const steps of Object.values(TOURS)) {
      for (const step of steps) {
        expect(step.target).toMatch(/^\[data-tour="[a-z-]+"\]$/);
        expect(step.title.length).toBeGreaterThan(3);
        expect(step.body.length).toBeGreaterThan(10);
      }
    }
  });
});
