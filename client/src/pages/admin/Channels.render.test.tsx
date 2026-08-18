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
  // The "click to connect" URLs; null means the platform hasn't registered
  // that app, which is what the default below exercises.
  connect: { slackAuthorizeUrl: null, discordInviteUrl: null } as Record<
    string,
    unknown
  > | null,
  secrets: {
    vaultConfigured: false,
    secrets: [] as Array<Record<string, unknown>>,
  } as Record<string, unknown> | null,
  setSecret: vi.fn(),
  deleteSecret: vi.fn(),
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
        useQuery: () => ({ data: mocks.connect, isLoading: false }),
      },
      channelSecrets: {
        useQuery: () => ({ data: mocks.secrets, isLoading: false }),
      },
      setChannelSecret: {
        useMutation: () => ({ mutate: mocks.setSecret, isPending: false }),
      },
      deleteChannelSecret: {
        useMutation: () => ({ mutate: mocks.deleteSecret, isPending: false }),
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
  mocks.connect = { slackAuthorizeUrl: null, discordInviteUrl: null };
  mocks.secrets = { vaultConfigured: false, secrets: [] };
});
afterEach(() => cleanup());

// "Bot token" labels appear once per credential group (Slack and Discord), so
// label text alone is ambiguous — reach for the specific control by id, the
// same way the Discord channel field above does.
const discordBotTokenInput = () =>
  document.getElementById("cred-discord_bot_token") as HTMLInputElement;

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

describe("Channels page — connect links", () => {
  it("renders the Slack and Discord connect links the platform supplies", () => {
    mocks.connect = {
      slackAuthorizeUrl: "https://slack.com/oauth/v2/authorize?state=signed",
      discordInviteUrl: "https://discord.com/oauth2/authorize?client_id=stub",
    };
    render(<Channels />);
    expect(
      screen.getByRole("link", { name: /add to slack/i }).getAttribute("href"),
    ).toBe("https://slack.com/oauth/v2/authorize?state=signed");
    expect(
      screen
        .getByRole("link", { name: /invite the Zolto bot/i })
        .getAttribute("href"),
    ).toBe("https://discord.com/oauth2/authorize?client_id=stub");
  });

  // Null means the platform hasn't registered that app — the button must be
  // hidden rather than rendered pointing nowhere.
  it("hides a connect link the platform hasn't registered", () => {
    render(<Channels />);
    expect(screen.queryByRole("link", { name: /add to slack/i })).toBeNull();
    expect(
      screen.queryByRole("link", { name: /invite the Zolto bot/i }),
    ).toBeNull();
  });
});

describe("Channels page — own bot credentials", () => {
  it("stores a pasted credential against its provider", () => {
    mocks.secrets = { vaultConfigured: true, secrets: [] };
    render(<Channels />);
    fireEvent.change(discordBotTokenInput(), {
      target: { value: "discord-token-abcd" },
    });
    // Each credential row has its own Save button, adjacent to its input.
    const saveButton = discordBotTokenInput()
      .closest("div")!
      .querySelector("button")!;
    fireEvent.click(saveButton);
    expect(mocks.setSecret).toHaveBeenCalledWith({
      provider: "discord_bot_token",
      value: "discord-token-abcd",
    });
  });

  it("shows a saved credential as a masked hint, never a value", () => {
    mocks.secrets = {
      vaultConfigured: true,
      secrets: [{ provider: "discord_bot_token", hint: "3f9a" }],
    };
    const { container } = render(<Channels />);
    expect(container.textContent).toContain("Saved (…3f9a)");
    expect(container.textContent).not.toContain("xoxb");
  });

  it("warns and disables the inputs when the deployment has no vault", () => {
    render(<Channels />);
    expect(screen.getByText(/no secrets vault configured/i)).toBeTruthy();
    expect(discordBotTokenInput().disabled).toBe(true);
  });
});
