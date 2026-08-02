import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { toast } from "sonner";
import Channels from "./Channels";

const mocks = vi.hoisted(() => ({
  settings: {
    whatsappNumber: "+41 79 111 22 33",
    instagramHandle: "bergblume",
    discordChannelId: "",
    discordOwnerUserId: "",
  } as Record<string, unknown> | null,
  invalidate: vi.fn(),
  save: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/components/admin/useTenantSettings", () => ({
  useTenantSettings: () => ({
    tenant: { slug: "bergblume", name: "Bergblume" },
    slug: "bergblume",
    settings: mocks.settings,
    isLoading: false,
    invalidate: mocks.invalidate,
  }),
}));

// The grid manager has its own trpc surface; here we only care that Channels
// mounts it inside the Instagram card.
vi.mock("@/components/InstagramManager", () => ({
  default: () => <div data-testid="instagram-manager" />,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    tenant: {
      updateSettings: {
        useMutation: () => ({ mutate: mocks.save, isPending: false }),
      },
      channelConnect: {
        useQuery: () => ({
          data: { slackAuthorizeUrl: null, discordInviteUrl: null },
          isLoading: false,
        }),
      },
      channelSecrets: {
        useQuery: () => ({
          data: { vaultConfigured: false, secrets: [] },
          isLoading: false,
        }),
      },
      setChannelSecret: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      deleteChannelSecret: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
    useUtils: () => ({
      tenant: {
        channelSecrets: { invalidate: vi.fn() },
      },
    }),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.settings = {
    whatsappNumber: "+41 79 111 22 33",
    instagramHandle: "bergblume",
    discordChannelId: "",
    discordOwnerUserId: "",
  };
});
afterEach(() => cleanup());

describe("Channels page", () => {
  it("prefills contact fields from saved settings", () => {
    render(<Channels />);
    expect(
      (screen.getByLabelText("WhatsApp number") as HTMLInputElement).value,
    ).toBe("+41 79 111 22 33");
    expect(
      (screen.getByLabelText("Instagram handle") as HTMLInputElement).value,
    ).toBe("bergblume");
    expect(screen.getByTestId("instagram-manager")).toBeTruthy();
  });

  it("saves contact channels, stripping a leading @ from the handle", () => {
    render(<Channels />);
    fireEvent.change(screen.getByLabelText("Instagram handle"), {
      target: { value: "@newhandle" },
    });
    fireEvent.click(screen.getAllByText("Save changes")[0]);
    expect(mocks.save).toHaveBeenCalledWith({
      whatsappNumber: "+41 79 111 22 33",
      instagramHandle: "newhandle",
    });
  });

  it("sends undefined for cleared contact fields", () => {
    render(<Channels />);
    fireEvent.change(screen.getByLabelText("WhatsApp number"), {
      target: { value: "  " },
    });
    fireEvent.change(screen.getByLabelText("Instagram handle"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getAllByText("Save changes")[0]);
    expect(mocks.save).toHaveBeenCalledWith({
      whatsappNumber: undefined,
      instagramHandle: undefined,
    });
  });

  it("rejects a malformed Discord channel ID before saving", () => {
    render(<Channels />);
    fireEvent.change(document.getElementById("discord-channel")!, {
      target: { value: "not-a-snowflake" },
    });
    fireEvent.click(screen.getAllByText("Save changes")[1]);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "A Discord channel ID is a 17–20 digit number.",
    );
  });

  it("rejects a malformed Discord user ID before saving", () => {
    render(<Channels />);
    fireEvent.change(screen.getByLabelText("Your Discord user ID"), {
      target: { value: "123" },
    });
    fireEvent.click(screen.getAllByText("Save changes")[1]);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "A Discord user ID is a 17–20 digit number.",
    );
  });

  it("saves well-formed Discord IDs", () => {
    render(<Channels />);
    fireEvent.change(document.getElementById("discord-channel")!, {
      target: { value: "123456789012345678" },
    });
    fireEvent.change(screen.getByLabelText("Your Discord user ID"), {
      target: { value: "876543210987654321" },
    });
    fireEvent.click(screen.getAllByText("Save changes")[1]);
    expect(mocks.save).toHaveBeenCalledWith({
      discordChannelId: "123456789012345678",
      discordOwnerUserId: "876543210987654321",
    });
  });
});
