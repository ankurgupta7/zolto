import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from "@testing-library/react";
import Keys from "./Keys";

interface PairingLinkData {
  available: true;
  deepLink: string;
  webLink: string;
  expiresAt: Date;
}

const mocks = vi.hoisted(() => ({
  authState: { user: { role: "admin" } as { role: string } | null },
  rotate: vi.fn(),
  mutationOpts: null as null | {
    onSuccess?: (data: { posApiKey: string }) => void;
  },
  // One-tap pairing state, driven per test.
  pairingAvailable: { available: true } as { available: boolean } | undefined,
  mintPairing: vi.fn(),
  pairingData: undefined as
    | PairingLinkData
    | { available: false; reason: string }
    | undefined,
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => mocks.authState }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    tenant: {
      rotatePosApiKey: {
        useMutation: (opts: (typeof mocks)["mutationOpts"]) => {
          mocks.mutationOpts = opts;
          return { mutate: mocks.rotate, isPending: false };
        },
      },
      posPairingAvailable: {
        useQuery: () => ({
          data: mocks.pairingAvailable,
          isLoading: false,
        }),
      },
      createPosPairingToken: {
        useMutation: () => ({
          mutate: mocks.mintPairing,
          isPending: false,
          data: mocks.pairingData,
        }),
      },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authState.user = { role: "admin" };
  mocks.pairingAvailable = { available: true };
  mocks.pairingData = undefined;
});
afterEach(() => cleanup());

describe("Keys page", () => {
  it("blocks non-admins", () => {
    mocks.authState.user = { role: "staff" };
    render(<Keys />);
    expect(screen.getByText("Admins only")).toBeTruthy();
  });

  it("requires confirmation before rotating the POS key", () => {
    render(<Keys />);
    fireEvent.click(screen.getByText("Generate a new key"));
    // Not rotated until the destructive confirm is clicked.
    expect(mocks.rotate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Yes, rotate the key"));
    expect(mocks.rotate).toHaveBeenCalledTimes(1);
  });

  it("shows the key and a scan-to-pair QR only after generation", () => {
    render(<Keys />);
    // Before a key exists there's nothing to encode.
    expect(screen.queryByTestId("pos-pairing-qr")).toBeNull();

    act(() => {
      mocks.mutationOpts?.onSuccess?.({ posApiKey: "pos_live_1234abcd" });
    });

    expect(screen.getByText("pos_live_1234abcd")).toBeTruthy();
    const qr = screen.getByTestId("pos-pairing-qr");
    // Rendered as an inline SVG, encoding the pairing payload client-side.
    expect(qr.querySelector("svg")).toBeTruthy();
  });
});

// One-tap pairing: the alternative to typing a 64-char key into a phone at a
// market stall. The link carries a single-use token, never the POS key.
describe("Keys page — pair a register", () => {
  it("offers to generate a pairing link", () => {
    render(<Keys />);
    expect(screen.getByText("Generate a pairing link")).toBeTruthy();
  });

  it("mints a link on click", () => {
    render(<Keys />);
    fireEvent.click(screen.getByText("Generate a pairing link"));
    expect(mocks.mintPairing).toHaveBeenCalled();
  });

  it("shows the deep link, the web link, a QR and an expiry once minted", () => {
    mocks.pairingData = {
      available: true,
      deepLink: "zolto://pair?t=tok123&url=https%3A%2F%2Fbergblume.zolto.ch",
      webLink: "https://bergblume.zolto.ch/pos/pair?t=tok123",
      expiresAt: new Date("2026-08-09T10:10:00Z"),
    };
    render(<Keys />);

    const open = screen.getByText("Open Zolto POS on this device").closest("a");
    expect(open?.getAttribute("href")).toBe(mocks.pairingData.deepLink);
    expect(
      screen.getByText("https://bergblume.zolto.ch/pos/pair?t=tok123"),
    ).toBeTruthy();
    expect(screen.getByTestId("pos-pairing-link-qr")).toBeTruthy();
    // Says it is single-use, which is why a stale link in a chat is harmless.
    expect(screen.getByText(/Works once/)).toBeTruthy();
  });

  it("encodes the deep link, not the POS key, into the QR", () => {
    // The QR must carry the redeemable token. A key here would put a bearer
    // credential into an image anyone in the room can photograph.
    mocks.pairingData = {
      available: true,
      deepLink: "zolto://pair?t=tok123",
      webLink: "https://bergblume.zolto.ch/pos/pair?t=tok123",
      expiresAt: new Date("2026-08-09T10:10:00Z"),
    };
    render(<Keys />);
    const qr = screen.getByTestId("pos-pairing-link-qr");
    expect(qr.querySelector("svg")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[0-9a-f]{64}/);
  });

  it("asks the merchant to rotate once when no key can be recovered", () => {
    // Keys minted before the vault write have no recoverable copy, so this must
    // explain the one action that fixes it rather than offering a dead button.
    mocks.pairingAvailable = { available: false };
    render(<Keys />);
    expect(screen.getByText(/Rotate your POS key above once/)).toBeTruthy();
    expect(screen.queryByText("Generate a pairing link")).toBeNull();
  });

  it("puts the open-app action before the QR in the DOM", () => {
    // On a phone the till IS this device, so tapping through is the action and
    // the QR only helps pair a different phone. Leading with the QR pushed the
    // button below the fold, where generating a link read as doing nothing.
    // Source order is what the mobile stack follows; `sm:order-*` flips it back
    // for a laptop, where you scan with the phone.
    mocks.pairingData = {
      available: true,
      deepLink: "zolto://pair?t=tok123",
      webLink: "https://bergblume.zolto.ch/pos/pair?t=tok123",
      expiresAt: new Date("2026-08-09T10:10:00Z"),
    };
    render(<Keys />);

    const action = screen.getByText("Open Zolto POS on this device");
    const qr = screen.getByTestId("pos-pairing-link-qr");
    const order = action.compareDocumentPosition(qr);
    expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
