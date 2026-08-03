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
import Signup from "./Signup";

const mocks = vi.hoisted(() => ({
  createVars: undefined as unknown,
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
        useMutation: () => ({
          mutate: (vars: unknown) => {
            mocks.createVars = vars;
          },
          isPending: false,
        }),
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
  mocks.createVars = undefined;
  mocks.aiVars = undefined;
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

function fillDetailsAndContinue() {
  fireEvent.change(screen.getByPlaceholderText("Your store name"), {
    target: { value: "Aurora Atelier" },
  });
  fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
    target: { value: "owner@aurora.example" },
  });
  fireEvent.click(screen.getByRole("button", { name: /choose your look/i }));
}

describe("Signup wizard", () => {
  it("gates the template step behind valid store details", () => {
    renderSignup();
    const next = screen.getByRole("button", { name: /choose your look/i });
    expect((next as HTMLButtonElement).disabled).toBe(true);
    fillDetailsAndContinue();
    // Now on step 2: all five templates render as selectable cards.
    expect(screen.getAllByRole("button", { pressed: false }).length).toBe(4);
    expect(screen.getAllByRole("button", { pressed: true }).length).toBe(1);
    expect(screen.getByText("Atelier")).toBeTruthy();
    expect(screen.getByText("Verdant")).toBeTruthy();
    expect(screen.getByText("Porcelain")).toBeTruthy();
    expect(screen.getByText("Bazaar")).toBeTruthy();
    expect(screen.getByText("Azure")).toBeTruthy();
  });

  it("selecting a template carries its default color into the branding step", () => {
    renderSignup();
    fillDetailsAndContinue();
    fireEvent.click(screen.getByText("Verdant").closest("button")!);
    fireEvent.click(
      screen.getByRole("button", { name: /choose your colors/i }),
    );
    const hex = screen.getByLabelText("Brand color hex") as HTMLInputElement;
    expect(hex.value).toBe("#2F5D3A");
  });

  it("creates the store with the chosen template and color", () => {
    renderSignup();
    fillDetailsAndContinue();
    fireEvent.click(screen.getByText("Azure").closest("button")!);
    fireEvent.click(
      screen.getByRole("button", { name: /choose your colors/i }),
    );
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
    fireEvent.click(
      screen.getByRole("button", { name: /choose your colors/i }),
    );
    const hex = screen.getByLabelText("Brand color hex") as HTMLInputElement;
    fireEvent.change(hex, { target: { value: "#123ABC" } });
    fireEvent.click(screen.getByRole("button", { name: /create store/i }));
    expect(mocks.createVars).toMatchObject({ primaryColor: "#123ABC" });

    mocks.createVars = undefined;
    fireEvent.change(hex, { target: { value: "teal" } });
    expect(screen.getByText(/6-digit hex/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /create store/i }));
    expect(mocks.createVars).toBeUndefined();
  });

  it("extracts colors from an uploaded logo via AI and offers the suggested template", async () => {
    renderSignup();
    fillDetailsAndContinue();
    fireEvent.click(
      screen.getByRole("button", { name: /choose your colors/i }),
    );

    const file = new File(["png-bytes"], "logo.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText(/logo \(optional\)/i), {
      target: { files: [file] },
    });
    // FileReader is async — the preview card appears once the data URL lands.
    await waitFor(() => screen.getByText("logo.png"));

    fireEvent.click(
      screen.getByRole("button", { name: /colors from logo/i }),
    );
    // The logo's data URL is what travels to the AI…
    expect(String((mocks.aiVars as { imageData: string }).imageData)).toMatch(
      /^data:image\/png;base64,/,
    );
    // …and the suggestion lands in the color field + a template hint.
    const hex = screen.getByLabelText("Brand color hex") as HTMLInputElement;
    expect(hex.value).toBe("#A34A24");
    expect(screen.getByText(/terracotta with market energy/i)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: /switch to the bazaar template/i }),
    );

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
});
