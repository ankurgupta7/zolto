import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import OnboardingChecklist from "./OnboardingChecklist";

const mocks = vi.hoisted(() => ({
  dismissMutate: vi.fn(),
  invalidate: vi.fn(),
  // Shaped like what server/onboarding.ts actually returns: i18next keys,
  // not copy — the assertions below are on the ENGLISH the keys resolve to.
  statusData: {
    tasks: [
      {
        id: "claim-admin",
        titleKey: "catalog.onboarding.tasks.claimAdmin.title",
        bodyKey: "catalog.onboarding.tasks.claimAdmin.body",
        done: true,
      },
      {
        id: "first-product",
        titleKey: "catalog.onboarding.tasks.firstProduct.title",
        bodyKey: "catalog.onboarding.tasks.firstProduct.body",
        href: "/admin",
        tourId: "add-product",
        done: false,
      },
      {
        id: "pos-ready",
        titleKey: "catalog.onboarding.tasks.posReady.title",
        bodyKey: "catalog.onboarding.tasks.posReady.body",
        done: false,
        blockedReasonKey: "catalog.onboarding.tasks.posReady.blockedStripe",
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
import i18n from "@/lib/i18n";
import catalogEn from "@/admin/locales/catalog.en.json";

/** Resolve a dotted i18next key against the English admin catalog fragment. */
function enLeaf(key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      catalogEn,
    );
}

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

/**
 * The server names the copy (i18next keys + interpolation values); the panel
 * renders it. That is what keeps the checklist in the merchant's language —
 * it used to arrive as English sentences and stayed English in every UI
 * language, because the server has no reliable notion of the viewer's locale.
 */
describe("OnboardingChecklist — translated task copy", () => {
  const originalTasks = mocks.statusData!.tasks;

  afterEach(async () => {
    mocks.statusData!.tasks = originalTasks;
    await i18n.changeLanguage("en");
  });

  it("interpolates the server's values into the translated sentence", () => {
    mocks.statusData!.tasks = [
      {
        id: "first-product",
        titleKey: "catalog.onboarding.tasks.firstProduct.migrateTitle",
        bodyKey: "catalog.onboarding.tasks.firstProduct.migrateBody",
        params: { provider: "Worldline / SIX" },
        href: "/admin/products/import",
        done: false,
      },
      {
        id: "invite-staff",
        titleKey: "catalog.onboarding.tasks.inviteStaff.title",
        bodyKey: "catalog.onboarding.tasks.inviteStaff.body",
        params: { count: 5 },
        done: false,
      },
    ];
    render(<OnboardingChecklist />);
    expect(
      screen.getByText("Bring your catalogue from Worldline / SIX"),
    ).toBeTruthy();
    expect(screen.getByText(/Your plan includes 5 staff seats/)).toBeTruthy();
  });

  it("follows the UI language, leaving brand names alone", async () => {
    await i18n.changeLanguage("de");
    render(<OnboardingChecklist />);
    expect(screen.getByText("Übernehmen Sie Ihren Shop")).toBeTruthy();
    expect(screen.getByText("Fügen Sie Ihr erstes Produkt hinzu")).toBeTruthy();
    // The blocked reason is translated too — it used to be a server sentence.
    expect(
      screen.getByText("Verbinden Sie zuerst Stripe (der Schritt oben)."),
    ).toBeTruthy();
    expect(screen.queryByText("Claim your store")).toBeNull();
  });

  it("agrees the seat noun with the count in French", async () => {
    await i18n.changeLanguage("fr");
    const seatTask = (count: number) => [
      {
        id: "invite-staff",
        titleKey: "catalog.onboarding.tasks.inviteStaff.title",
        bodyKey: "catalog.onboarding.tasks.inviteStaff.body",
        params: { count },
        done: false,
      },
    ];

    mocks.statusData!.tasks = seatTask(1);
    render(<OnboardingChecklist />);
    expect(screen.getByText(/1 place d'équipe/)).toBeTruthy();
    cleanup();

    mocks.statusData!.tasks = seatTask(3);
    render(<OnboardingChecklist />);
    expect(screen.getByText(/3 places d'équipe/)).toBeTruthy();
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
        // Steps carry i18next keys; an unresolvable one renders the raw
        // dotted path to the merchant, so check the copy really exists.
        expect(typeof enLeaf(step.titleKey)).toBe("string");
        expect(typeof enLeaf(step.bodyKey)).toBe("string");
      }
    }
  });
});
