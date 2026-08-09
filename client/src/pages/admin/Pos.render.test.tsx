import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import Pos from "./Pos";

const mocks = vi.hoisted(() => ({
  meData: { terminalLocationId: null, slug: "aurora" } as
    | Record<string, unknown>
    | undefined,
  connectData: { connected: false, url: "https://connect.stripe.test/x" } as
    | Record<string, unknown>
    | undefined,
  settingsData: { twintQrUrl: null } as Record<string, unknown> | null,
  setTwintQr: vi.fn(),
  invalidateSettings: vi.fn(),
  downloadsData: undefined as Record<string, unknown> | undefined,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      tenant: { getSettings: { invalidate: mocks.invalidateSettings } },
    }),
    tenant: {
      me: { useQuery: () => ({ data: mocks.meData, isLoading: false }) },
      getStripeConnectUrl: {
        useQuery: () => ({ data: mocks.connectData, isLoading: false }),
      },
      getSettings: {
        useQuery: () => ({ data: mocks.settingsData, isLoading: false }),
      },
      setTwintQr: {
        useMutation: () => ({ mutate: mocks.setTwintQr, isPending: false }),
      },
      // Read by the embedded PosAppCard; its own behaviour is covered in
      // components/admin/PosAppCard.render.test.tsx.
      posDownloads: {
        useQuery: () => ({ data: mocks.downloadsData, isLoading: false }),
      },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.meData = { terminalLocationId: null, slug: "aurora" };
  mocks.connectData = {
    connected: false,
    url: "https://connect.stripe.test/x",
  };
  mocks.settingsData = { twintQrUrl: null };
  mocks.downloadsData = {
    android: { url: "https://x.test/a.apk", requiresSideload: false },
    ios: { url: "https://x.test/a.ipa", requiresSideload: true },
  };
});
afterEach(() => cleanup());

describe("POS page", () => {
  it("shows payments as not set up until Stripe is connected", () => {
    render(<Pos />);
    expect(screen.getByText("Point of sale")).toBeTruthy();
    expect(screen.getAllByText("Not set up").length).toBeGreaterThanOrEqual(2); // Tap to Pay + TWINT
    expect(screen.getByText("Connect Stripe")).toBeTruthy();
  });

  it("reflects a connected account and a pending terminal", () => {
    mocks.connectData = { connected: true, url: null };
    render(<Pos />);
    expect(screen.getAllByText("Ready").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Pending first use")).toBeTruthy();
    expect(screen.queryByText("Connect Stripe")).toBeNull();
  });

  it("marks the terminal provisioned once a location exists", () => {
    mocks.connectData = { connected: true, url: null };
    mocks.meData = { terminalLocationId: "tml_123" };
    render(<Pos />);
    expect(screen.getByText("Provisioned")).toBeTruthy();
  });

  it("sends the merchant to Stripe when Connect is clicked", () => {
    const orig = Object.getOwnPropertyDescriptor(window, "location");
    const stub = { href: "" };
    Object.defineProperty(window, "location", {
      value: stub,
      writable: true,
      configurable: true,
    });
    render(<Pos />);
    fireEvent.click(screen.getByText("Connect Stripe"));
    expect(stub.href).toBe("https://connect.stripe.test/x");
    if (orig) Object.defineProperty(window, "location", orig);
  });

  describe("TWINT QR sticker", () => {
    it("offers an upload and no remove button until one exists", () => {
      render(<Pos />);
      expect(screen.getByText("Not uploaded")).toBeTruthy();
      expect(screen.getByText("Upload QR code")).toBeTruthy();
      expect(screen.queryByText("Remove")).toBeNull();
    });

    it("shows the uploaded sticker and offers replace + remove", () => {
      mocks.settingsData = { twintQrUrl: "https://cdn.test/qr_ab12.png" };
      render(<Pos />);
      const img = screen.getByAltText("Your TWINT QR code") as HTMLImageElement;
      expect(img.src).toBe("https://cdn.test/qr_ab12.png");
      expect(screen.getByText("Replace image")).toBeTruthy();
      expect(screen.getByText("Remove")).toBeTruthy();
    });

    it("clears the sticker by sending a null image", () => {
      mocks.settingsData = { twintQrUrl: "https://cdn.test/qr_ab12.png" };
      render(<Pos />);
      fireEvent.click(screen.getByText("Remove"));
      expect(mocks.setTwintQr).toHaveBeenCalledWith({ imageData: null });
    });

    it("rejects a non-image file without calling the mutation", () => {
      const { container } = render(<Pos />);
      const input = container.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const file = new File(["x"], "notes.pdf", { type: "application/pdf" });
      Object.defineProperty(input, "files", { value: [file] });
      fireEvent.change(input);
      expect(mocks.setTwintQr).not.toHaveBeenCalled();
    });

    it("uploads a PNG as base64 with its mime type", async () => {
      const { container } = render(<Pos />);
      const input = container.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const file = new File(["png-bytes"], "twint.png", { type: "image/png" });
      Object.defineProperty(input, "files", { value: [file] });
      fireEvent.change(input);

      await vi.waitFor(() => {
        expect(mocks.setTwintQr).toHaveBeenCalledWith(
          expect.objectContaining({ mimeType: "image/png" }),
        );
      });
      const arg = mocks.setTwintQr.mock.calls[0][0] as { imageData: string };
      expect(arg.imageData.startsWith("data:image/png;base64,")).toBe(true);
    });
  });
});
