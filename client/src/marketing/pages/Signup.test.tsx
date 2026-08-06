// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { toast } from "sonner";
import Signup from "./Signup";

const mocks = vi.hoisted(() => ({
  createVars: undefined as unknown,
  createOpts: undefined as
    | {
        onError?: (err: unknown) => void;
        onSuccess?: (data: unknown) => void;
      }
    | undefined,
  aiVars: undefined as unknown,
  aiResult: {
    primaryColor: "#A34A24",
    secondaryColor: null as string | null,
    suggestedTemplateId: "bazaar" as string | null,
    rationale: "Warm terracotta with market energy.",
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    tenant: {
      create: {
        useMutation: (opts?: {
          onError?: (err: unknown) => void;
          onSuccess?: (data: unknown) => void;
        }) => {
          mocks.createOpts = opts;
          return {
            mutate: (vars: unknown) => {
              mocks.createVars = vars;
            },
            isPending: false,
          };
        },
      },
      brandingFromLogo: {
        useMutation: (opts?: {
          onSuccess?: (data: typeof mocks.aiResult) => void;
        }) => ({
          mutate: (vars: unknown) => {
            mocks.aiVars = vars;
            opts?.onSuccess?.(mocks.aiResult);
          },
          isPending: false,
        }),
      },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createVars = undefined;
  mocks.createOpts = undefined;
  mocks.aiVars = undefined;
  mocks.aiResult = {
    primaryColor: "#A34A24",
    secondaryColor: null,
    suggestedTemplateId: "bazaar",
    rationale: "Warm terracotta with market energy.",
  };
});

afterEach(() => {
  cleanup();
});

function renderSignup() {
  const { hook, searchHook } = memoryLocation({
    path: "/signup",
    static: true,
  });
  return render(
    <Router hook={hook} searchHook={searchHook}>
      <Signup />
    </Router>,
  );
}

/** Fill the details step and land on the single "Your look" step. */
function fillDetailsAndContinue() {
  fireEvent.change(screen.getByPlaceholderText("Your store name"), {
    target: { value: "Aurora Atelier" },
  });
  fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
    target: { value: "owner@aurora.example" },
  });
  fireEvent.click(screen.getByRole("button", { name: /choose your look/i }));
}

const hexField = () =>
  screen.getByLabelText("Brand color hex") as HTMLInputElement;

/** Upload a logo and run the (mocked) AI extraction. */
async function uploadLogoAndExtract() {
  const file = new File(["png-bytes"], "logo.png", { type: "image/png" });
  fireEvent.change(screen.getByLabelText(/logo \(optional\)/i), {
    target: { files: [file] },
  });
  await waitFor(() => screen.getByText("logo.png"));
  fireEvent.click(screen.getByRole("button", { name: /colors from logo/i }));
}

describe("Signup wizard", () => {
  it("gates the look step behind valid store details", () => {
    renderSignup();
    const next = screen.getByRole("button", { name: /choose your look/i });
    expect((next as HTMLButtonElement).disabled).toBe(true);
    fillDetailsAndContinue();
    // Logo, color, and all five templates now live on ONE screen — the
    // decisions inform each other, so splitting them made the merchant's
    // choice appear to mutate between screens.
    expect(screen.getByLabelText(/logo \(optional\)/i)).toBeTruthy();
    expect(hexField()).toBeTruthy();
    expect(screen.getAllByRole("button", { pressed: false }).length).toBe(4);
    expect(screen.getAllByRole("button", { pressed: true }).length).toBe(1);
    expect(screen.getByText("Atelier")).toBeTruthy();
    expect(screen.getByText("Verdant")).toBeTruthy();
    expect(screen.getByText("Porcelain")).toBeTruthy();
    expect(screen.getByText("Bazaar")).toBeTruthy();
    expect(screen.getByText("Azure")).toBeTruthy();
  });

  it("sends the chosen vertical and range description with create (default: other)", () => {
    renderSignup();
    // Default rides along even when the merchant never touches the field.
    fillDetailsAndContinue();
    fireEvent.click(screen.getByRole("button", { name: /create store/i }));
    expect(mocks.createVars).toMatchObject({
      vertical: "other",
      verticalDescription: undefined,
    });
  });

  it("carries a picked vertical + description through the wizard", () => {
    renderSignup();
    fireEvent.change(screen.getByPlaceholderText("Your store name"), {
      target: { value: "Ton & Teller" },
    });
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "owner@ton.example" },
    });
    // Step 1 has two selects: the vertical picker, then "already selling
    // somewhere?".
    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "ceramics" },
    });
    fireEvent.change(
      screen.getByPlaceholderText(
        "e.g. Wheel-thrown stoneware tableware in muted glazes",
      ),
      { target: { value: "Wheel-thrown stoneware from Bern" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /choose your look/i }));
    fireEvent.click(screen.getByRole("button", { name: /create store/i }));
    expect(mocks.createVars).toMatchObject({
      vertical: "ceramics",
      verticalDescription: "Wheel-thrown stoneware from Bern",
    });
  });

  it("sends no migration source when the merchant is starting fresh", () => {
    renderSignup();
    fillDetailsAndContinue();
    fireEvent.click(screen.getByRole("button", { name: /create store/i }));
    expect(mocks.createVars).toMatchObject({ migrateFrom: undefined });
  });

  it("carries the provider a switching merchant names through to create", () => {
    renderSignup();
    fireEvent.change(screen.getByPlaceholderText("Your store name"), {
      target: { value: "Aurora Atelier" },
    });
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "owner@aurora.example" },
    });
    // Second select on step 1 — see the vertical test above.
    fireEvent.change(screen.getAllByRole("combobox")[1], {
      target: { value: "sumup" },
    });
    fireEvent.click(screen.getByRole("button", { name: /choose your look/i }));
    fireEvent.click(screen.getByRole("button", { name: /create store/i }));
    expect(mocks.createVars).toMatchObject({ migrateFrom: "sumup" });
  });

  it("reassures a switcher about what happens to their catalogue", () => {
    const { container } = renderSignup();
    // Nothing promised before they say they're switching.
    expect(container.textContent).not.toContain("Export your items as CSV");

    fireEvent.change(screen.getAllByRole("combobox")[1], {
      target: { value: "worldline" },
    });
    expect(container.textContent).toContain("Worldline / SIX");
    expect(container.textContent).toContain("Export your items as CSV");

    // Stripe gets the one-click promise instead of the CSV instructions.
    fireEvent.change(screen.getAllByRole("combobox")[1], {
      target: { value: "stripe" },
    });
    expect(container.textContent).toContain("one click");
    expect(container.textContent).not.toContain("Export your items as CSV");

    // "Somewhere else" has no importer of its own, so it promises nothing.
    fireEvent.change(screen.getAllByRole("combobox")[1], {
      target: { value: "other" },
    });
    expect(container.textContent).not.toContain("Export your items as CSV");
    expect(container.textContent).not.toContain("one click");
  });

  it("seeds the color from a template while the merchant hasn't set one", () => {
    renderSignup();
    fillDetailsAndContinue();
    fireEvent.click(screen.getByText("Verdant").closest("button")!);
    expect(hexField().value).toBe("#2F5D3A");
    fireEvent.click(screen.getByText("Azure").closest("button")!);
    expect(hexField().value).toBe("#1E4E79");
  });

  // The bug that motivated merging the steps: a color the merchant (or the AI)
  // settled must survive every later template change, because a template only
  // owns the SURFACE variables — it must never silently re-take the ink.
  it("never overwrites a chosen color when the template changes", () => {
    renderSignup();
    fillDetailsAndContinue();
    fireEvent.change(hexField(), { target: { value: "#123ABC" } });
    fireEvent.click(screen.getByText("Verdant").closest("button")!);
    expect(hexField().value).toBe("#123ABC");
    fireEvent.click(screen.getByText("Porcelain").closest("button")!);
    expect(hexField().value).toBe("#123ABC");
    fireEvent.click(screen.getByRole("button", { name: /create store/i }));
    expect(mocks.createVars).toMatchObject({
      templateId: "porcelain",
      primaryColor: "#123ABC",
    });
  });

  it("creates the store with the chosen template and color", () => {
    renderSignup();
    fillDetailsAndContinue();
    fireEvent.click(screen.getByText("Azure").closest("button")!);
    fireEvent.click(screen.getByRole("button", { name: /create store/i }));
    expect(mocks.createVars).toMatchObject({
      name: "Aurora Atelier",
      slug: "aurora-atelier",
      email: "owner@aurora.example",
      templateId: "azure",
      primaryColor: "#1E4E79",
      logo: undefined,
    });
  });

  it("respects a manually chosen color and refuses a malformed one", () => {
    renderSignup();
    fillDetailsAndContinue();
    const hex = hexField();
    fireEvent.change(hex, { target: { value: "#123ABC" } });
    fireEvent.click(screen.getByRole("button", { name: /create store/i }));
    expect(mocks.createVars).toMatchObject({ primaryColor: "#123ABC" });

    mocks.createVars = undefined;
    fireEvent.change(hex, { target: { value: "teal" } });
    expect(screen.getByText(/6-digit hex/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /create store/i }));
    expect(mocks.createVars).toBeUndefined();
  });

  it("applies the AI's color and template suggestion in place, and marks the card", async () => {
    renderSignup();
    fillDetailsAndContinue();

    const file = new File(["png-bytes"], "logo.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText(/logo \(optional\)/i), {
      target: { files: [file] },
    });
    // FileReader is async — the preview card appears once the data URL lands.
    await waitFor(() => screen.getByText("logo.png"));

    fireEvent.click(screen.getByRole("button", { name: /colors from logo/i }));
    // The logo's data URL is what travels to the AI…
    expect(String((mocks.aiVars as { imageData: string }).imageData)).toMatch(
      /^data:image\/png;base64,/,
    );
    // …and the suggestion is applied on the spot — no "switch template?" prompt.
    expect(hexField().value).toBe("#A34A24");
    expect(screen.getByText(/terracotta with market energy/i)).toBeTruthy();
    const bazaar = screen.getByText("Bazaar").closest("button")!;
    expect(bazaar.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/suggested from your logo/i)).toBeTruthy();

    // The final payload carries logo + AI color + accepted template.
    fireEvent.click(screen.getByRole("button", { name: /create store/i }));
    expect(mocks.createVars).toMatchObject({
      templateId: "bazaar",
      primaryColor: "#A34A24",
      logo: {
        mimeType: "image/png",
        imageData: expect.stringMatching(/^data:image\/png;base64,/),
      },
    });
  });
  it("lets the merchant overrule the AI's template while keeping its color", async () => {
    renderSignup();
    fillDetailsAndContinue();
    await uploadLogoAndExtract();
    fireEvent.click(screen.getByText("Porcelain").closest("button")!);

    expect(hexField().value).toBe("#A34A24");
    fireEvent.click(screen.getByRole("button", { name: /create store/i }));
    expect(mocks.createVars).toMatchObject({
      templateId: "porcelain",
      primaryColor: "#A34A24",
    });
  });

  it("keeps the merchant's template when the AI has no usable suggestion", async () => {
    mocks.aiResult = {
      primaryColor: "#1F2933",
      secondaryColor: null,
      suggestedTemplateId: null,
      rationale: "Cool charcoal.",
    };
    renderSignup();
    fillDetailsAndContinue();
    fireEvent.click(screen.getByText("Verdant").closest("button")!);
    await uploadLogoAndExtract();

    expect(hexField().value).toBe("#1F2933");
    expect(
      screen.getByText("Verdant").closest("button")!.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.queryByText(/suggested from your logo/i)).toBeNull();
  });
});

// A refused email is recoverable by signing in (the server's CONFLICT message
// says how — including the half-finished-signup case), so the toast must carry
// the door, not just the wall.
describe("Signup — conflict recovery", () => {
  it("offers a Sign in action when the email is already taken or mid-signup", () => {
    renderSignup();
    mocks.createOpts?.onError?.({
      message:
        "You already started a signup with this email — your store is created and waiting. Sign in with this same email to finish setting it up.",
      data: { code: "CONFLICT" },
    });
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/finish setting it up/i),
      expect.objectContaining({
        action: expect.objectContaining({ label: "Sign in" }),
      }),
    );
  });

  it("keeps the slug-taken conflict plain — no sign-in detour for a URL clash", () => {
    renderSignup();
    mocks.createOpts?.onError?.({
      message: "Store URL already taken",
      data: { code: "CONFLICT" },
    });
    expect(toast.error).toHaveBeenCalledWith("Store URL already taken");
  });
});

describe("Signup — success toast", () => {
  const successData = {
    tenantId: 42,
    slug: "aurora-atelier",
    claimToken: "tok-abc",
    logoUrl: null,
    claimEmailSent: false,
  };

  it("mentions the emailed setup link when it actually went out", () => {
    renderSignup();
    mocks.createOpts?.onSuccess?.({ ...successData, claimEmailSent: true });
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringMatching(/emailed you a setup link/i),
    );
  });

  it("stays quiet about email on deployments without mail configured", () => {
    renderSignup();
    mocks.createOpts?.onSuccess?.(successData);
    expect(toast.success).toHaveBeenCalledWith(
      expect.not.stringMatching(/emailed/i),
    );
  });
});
