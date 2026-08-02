import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const invokeLLM = vi.fn();

vi.mock("./_core/llm", () => ({
  invokeLLM: (...args: unknown[]) => invokeLLM(...args),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

vi.mock("./db", () => ({
  createProduct: vi.fn(),
  getProductByDiscordMessageId: vi.fn(),
}));

const vault = vi.hoisted(() => ({
  listTenantIdsWithSecret: vi.fn(),
  getTenantSecret: vi.fn(),
}));
vi.mock("./tenantSecrets", () => ({
  listTenantIdsWithSecret: vault.listTenantIdsWithSecret,
  getTenantSecret: vault.getTenantSecret,
}));

const axiosGet = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({
  default: { get: axiosGet, post: vi.fn() },
}));

// A gateway "socket" that never connects — enough to observe which tokens got
// a connection attempt without touching the network.
vi.mock("ws", () => ({
  default: class FakeWebSocket {
    on() {}
    close() {}
  },
}));

import {
  parseProductFromMessage,
  startDiscordGateway,
  startGatewayForToken,
  stopDiscordGateway,
} from "./discord";

function llmResponse(content: string) {
  return { choices: [{ message: { content } }] };
}

describe("parseProductFromMessage", () => {
  beforeEach(() => {
    invokeLLM.mockReset();
  });

  it("returns null for whitespace-only text without calling the LLM", async () => {
    const result = await parseProductFromMessage("   ");
    expect(result).toBeNull();
    expect(invokeLLM).not.toHaveBeenCalled();
  });

  it("returns null when the LLM response has no message content", async () => {
    invokeLLM.mockResolvedValue({ choices: [{ message: {} }] });
    const result = await parseProductFromMessage("Pearl ring, CHF 99");
    expect(result).toBeNull();
  });

  it("returns null when the LLM response is malformed JSON", async () => {
    invokeLLM.mockResolvedValue(llmResponse("not valid json {"));
    const result = await parseProductFromMessage("Pearl ring, CHF 99");
    expect(result).toBeNull();
  });

  it("returns null when invokeLLM rejects", async () => {
    invokeLLM.mockRejectedValue(new Error("LLM unavailable"));
    const result = await parseProductFromMessage("Pearl ring, CHF 99");
    expect(result).toBeNull();
  });

  it("coerces a numeric-string price to a number", async () => {
    invokeLLM.mockResolvedValue(
      llmResponse(
        JSON.stringify({
          name: "Pearl Ring",
          description: "Freshwater pearl ring",
          price: "99.50",
          category: "Rings",
        }),
      ),
    );
    const result = await parseProductFromMessage("Pearl ring, CHF 99.50");
    expect(result).not.toBeNull();
    expect(result?.price).toBe(99.5);
    expect(typeof result?.price).toBe("number");
  });

  it("passes through the category exactly as returned by the LLM", async () => {
    invokeLLM.mockResolvedValue(
      llmResponse(
        JSON.stringify({
          name: "Moonstone Bangle",
          description: "Rigid silver bangle with moonstone inlay",
          price: 220,
          category: "Bangles",
        }),
      ),
    );
    const result = await parseProductFromMessage("Moonstone bangle, CHF 220");
    expect(result?.category).toBe("Bangles");
  });

  it("passes the message text through to the LLM prompt", async () => {
    invokeLLM.mockResolvedValue(
      llmResponse(
        JSON.stringify({
          name: "Drop Earrings",
          description: "Gold drop earrings",
          price: 150,
          category: "Earrings",
        }),
      ),
    );
    await parseProductFromMessage("Gold drop earrings, CHF 150");

    const call = invokeLLM.mock.calls[0][0];
    const userMessage = call.messages.find(
      (m: { role: string }) => m.role === "user",
    );
    expect(userMessage.content).toContain("Gold drop earrings, CHF 150");
  });
});

describe("multi-tenant gateway startup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    axiosGet.mockResolvedValue({ data: { url: "wss://gateway.discord.gg" } });
    vault.listTenantIdsWithSecret.mockResolvedValue([]);
    vault.getTenantSecret.mockResolvedValue(null);
  });

  afterEach(() => {
    stopDiscordGateway();
  });

  it("opens one connection per tenant-supplied bot token", async () => {
    vault.listTenantIdsWithSecret.mockResolvedValue([5, 9]);
    vault.getTenantSecret.mockImplementation(
      async (tenantId: number) => `token-tenant-${tenantId}`,
    );

    await startDiscordGateway();
    // startGatewayForToken is fire-and-forget; let the queued ones resolve.
    await new Promise((r) => setImmediate(r));

    expect(vault.listTenantIdsWithSecret).toHaveBeenCalledWith(
      "discord_bot_token",
    );
    const authHeaders = axiosGet.mock.calls.map(
      (c) =>
        (c[1] as { headers: { Authorization: string } }).headers.Authorization,
    );
    expect(authHeaders).toContain("Bot token-tenant-5");
    expect(authHeaders).toContain("Bot token-tenant-9");
  });

  it("is idempotent per token — a second start attempt is a no-op", async () => {
    await startGatewayForToken("token-abc");
    await startGatewayForToken("token-abc");
    expect(axiosGet).toHaveBeenCalledTimes(1);
  });

  it("still starts nothing when neither env nor vault has a token", async () => {
    await startDiscordGateway();
    await new Promise((r) => setImmediate(r));
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it("survives a vault failure and reports it rather than throwing", async () => {
    vault.listTenantIdsWithSecret.mockRejectedValue(new Error("no DB"));
    await expect(startDiscordGateway()).resolves.toBeUndefined();
  });
});
