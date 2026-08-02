import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const {
  invokeLLM,
  notifyOwner,
  storagePut,
  getTenantByDiscordChannelId,
  getTenantSettings,
  getTenantCategories,
  getProductByDiscordMessageId,
  createProduct,
  axiosGet,
  axiosPost,
  wsInstances,
} = vi.hoisted(() => {
  // Module-level consts in discord.ts read these at import time; the hoisted
  // block runs before the (hoisted) ESM imports are evaluated.
  process.env.DISCORD_BOT_TOKEN = "test-bot-token";
  process.env.DISCORD_CHANNEL_ID = "legacy-channel";
  return {
    invokeLLM: vi.fn(),
    notifyOwner: vi.fn(),
    storagePut: vi.fn(),
    getTenantByDiscordChannelId: vi.fn(),
    getTenantSettings: vi.fn(),
    getTenantCategories: vi.fn(),
    getProductByDiscordMessageId: vi.fn(),
    createProduct: vi.fn(),
    axiosGet: vi.fn(),
    axiosPost: vi.fn(),
    wsInstances: [] as MockWs[],
  };
});

interface MockWs {
  handlers: Record<string, (arg?: unknown) => void>;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  readyState: number;
  url: string;
  on(event: string, cb: (arg?: unknown) => void): MockWs;
  emit(event: string, arg?: unknown): void;
}

vi.mock("ws", () => {
  class MockWsImpl implements MockWs {
    handlers: Record<string, (arg?: unknown) => void> = {};
    send = vi.fn();
    close = vi.fn();
    readyState = 1;
    constructor(public url: string) {
      wsInstances.push(this);
    }
    on(event: string, cb: (arg?: unknown) => void) {
      this.handlers[event] = cb;
      return this;
    }
    emit(event: string, arg?: unknown) {
      this.handlers[event]?.(arg);
    }
  }
  return { default: MockWsImpl };
});

vi.mock("./_core/llm", () => ({ invokeLLM }));
vi.mock("./_core/notification", () => ({ notifyOwner }));
vi.mock("./storage", () => ({ storagePut }));
vi.mock("./db", () => ({
  getTenantByDiscordChannelId,
  getTenantSettings,
  getTenantCategories,
  getProductByDiscordMessageId,
  createProduct,
}));
vi.mock("axios", () => ({
  default: { get: axiosGet, post: axiosPost },
}));

import {
  handleDiscordMessage,
  startDiscordGateway,
  stopDiscordGateway,
  type DiscordMessage,
} from "./discord";

function baseMessage(overrides: Partial<DiscordMessage> = {}): DiscordMessage {
  return {
    id: "msg-1",
    channel_id: "chan-1",
    author: { id: "user-1", bot: false },
    content: "Pearl ring, CHF 99",
    attachments: [],
    ...overrides,
  };
}

function llmProduct() {
  invokeLLM.mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            name: "Pearl Ring",
            description: "Freshwater pearl ring",
            price: 99,
            category: "Rings",
          }),
        },
      },
    ],
  });
}

describe("handleDiscordMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notifyOwner.mockResolvedValue(true);
    createProduct.mockResolvedValue({ id: 1 });
    getProductByDiscordMessageId.mockResolvedValue(null);
    getTenantSettings.mockResolvedValue(null);
    getTenantCategories.mockResolvedValue(
      ["Necklaces", "Earrings", "Rings", "Other"].map((key, i) => ({
        id: i + 1,
        tenantId: 1,
        key,
        labelEn: key,
        labelDe: null,
        extraIncludes: null,
        sortOrder: i,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    );
    axiosPost.mockResolvedValue({ data: {} });
  });

  it("ignores messages authored by a bot", async () => {
    await handleDiscordMessage(baseMessage({ author: { id: "b", bot: true } }));
    expect(getTenantByDiscordChannelId).not.toHaveBeenCalled();
  });

  it("ignores an unmapped channel that isn't the legacy channel", async () => {
    getTenantByDiscordChannelId.mockResolvedValue(null);
    await handleDiscordMessage(baseMessage({ channel_id: "other-channel" }));
    expect(createProduct).not.toHaveBeenCalled();
  });

  it("skips a message that was already processed", async () => {
    getTenantByDiscordChannelId.mockResolvedValue({ id: 7, name: "Aurora" });
    getProductByDiscordMessageId.mockResolvedValue({ id: 42 });
    await handleDiscordMessage(baseMessage());
    expect(createProduct).not.toHaveBeenCalled();
  });

  it("returns early when there is neither text nor attachments", async () => {
    getTenantByDiscordChannelId.mockResolvedValue({ id: 7, name: "Aurora" });
    await handleDiscordMessage(
      baseMessage({ content: "   ", attachments: [] }),
    );
    expect(invokeLLM).not.toHaveBeenCalled();
    expect(createProduct).not.toHaveBeenCalled();
  });

  it("creates a product, notifies the owner, and posts a confirmation", async () => {
    getTenantByDiscordChannelId.mockResolvedValue({
      id: 7,
      name: "Aurora",
      domain: "aurora.example",
    });
    llmProduct();
    await handleDiscordMessage(baseMessage());

    expect(createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Pearl Ring",
        category: "Rings",
        price: "99",
        tenantId: 7,
        discordMessageId: "msg-1",
      }),
    );
    expect(notifyOwner).toHaveBeenCalled();
    expect(axiosPost).toHaveBeenCalledWith(
      expect.stringContaining("/channels/chan-1/messages"),
      expect.objectContaining({ message_reference: { message_id: "msg-1" } }),
      expect.any(Object),
    );
  });

  it("downloads an image attachment and stores it", async () => {
    getTenantByDiscordChannelId.mockResolvedValue({ id: 7, name: "Aurora" });
    axiosGet.mockResolvedValue({ data: new ArrayBuffer(4) });
    storagePut.mockResolvedValue({ url: "https://cdn/x.jpg", key: "k" });
    llmProduct();

    await handleDiscordMessage(
      baseMessage({
        attachments: [
          {
            id: "a1",
            url: "https://discord/x.jpg",
            filename: "x.jpg",
            content_type: "image/jpeg",
            size: 10,
          },
        ],
      }),
    );

    expect(storagePut).toHaveBeenCalled();
    expect(createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ imageUrl: "https://cdn/x.jpg" }),
    );
  });

  it("still creates the product when image download fails", async () => {
    getTenantByDiscordChannelId.mockResolvedValue({ id: 7, name: "Aurora" });
    axiosGet.mockRejectedValue(new Error("download failed"));
    llmProduct();

    await handleDiscordMessage(
      baseMessage({
        attachments: [
          {
            id: "a1",
            url: "https://discord/x.png",
            filename: "x.png",
            content_type: "image/png",
            size: 10,
          },
        ],
      }),
    );

    expect(createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ imageUrl: undefined }),
    );
  });

  it("skips product creation when the LLM cannot parse the message", async () => {
    getTenantByDiscordChannelId.mockResolvedValue({ id: 7, name: "Aurora" });
    invokeLLM.mockResolvedValue({ choices: [{ message: {} }] });
    await handleDiscordMessage(baseMessage());
    expect(createProduct).not.toHaveBeenCalled();
  });

  it("does not throw when the confirmation reply fails", async () => {
    getTenantByDiscordChannelId.mockResolvedValue({ id: 7, name: "Aurora" });
    llmProduct();
    axiosPost.mockRejectedValue(new Error("discord down"));
    await expect(handleDiscordMessage(baseMessage())).resolves.toBeUndefined();
    expect(createProduct).toHaveBeenCalled();
  });

  it("uses white-label branding from tenant settings when present", async () => {
    getTenantByDiscordChannelId.mockResolvedValue({ id: 7, name: "Aurora" });
    getTenantSettings.mockResolvedValue({
      whiteLabelName: "Lumière",
      contactEmail: "hi@lumiere.example",
    });
    llmProduct();
    await handleDiscordMessage(baseMessage());
    const notifyArg = notifyOwner.mock.calls[0][0];
    expect(notifyArg.title).toContain("Lumière");
  });
});

describe("Discord gateway client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wsInstances.length = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopDiscordGateway();
    vi.useRealTimers();
  });

  it("fetches the gateway URL and opens a WebSocket", async () => {
    axiosGet.mockResolvedValue({ data: { url: "wss://gateway.discord" } });
    await startDiscordGateway();
    expect(wsInstances).toHaveLength(1);
    expect(wsInstances[0].url).toContain("wss://gateway.discord");
    // The open handler just logs — exercise it for coverage.
    wsInstances[0].emit("open");
  });

  it("starts heartbeating and identifies on the Hello (op 10) payload", async () => {
    axiosGet.mockResolvedValue({ data: { url: "wss://gateway.discord" } });
    await startDiscordGateway();
    const ws = wsInstances[0];

    ws.emit(
      "message",
      Buffer.from(
        JSON.stringify({ op: 10, s: 5, d: { heartbeat_interval: 1000 } }),
      ),
    );
    // identify() sends op 2
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"op":2'));

    // The heartbeat interval fires an op 1 with the last sequence.
    ws.send.mockClear();
    vi.advanceTimersByTime(1000);
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"op":1'));
  });

  it("acks (op 11) and ignores unknown opcodes without sending", async () => {
    axiosGet.mockResolvedValue({ data: { url: "wss://gateway.discord" } });
    await startDiscordGateway();
    const ws = wsInstances[0];
    ws.emit("message", Buffer.from(JSON.stringify({ op: 11 })));
    expect(ws.send).not.toHaveBeenCalled();
  });

  it("re-identifies after an Invalid Session (op 9)", async () => {
    axiosGet.mockResolvedValue({ data: { url: "wss://gateway.discord" } });
    await startDiscordGateway();
    const ws = wsInstances[0];
    // Hello first so the ws is fully wired, then invalid-session.
    ws.emit(
      "message",
      Buffer.from(JSON.stringify({ op: 10, d: { heartbeat_interval: 1000 } })),
    );
    ws.send.mockClear();
    ws.emit("message", Buffer.from(JSON.stringify({ op: 9 })));
    vi.advanceTimersByTime(2000);
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"op":2'));
  });

  it("reconnects on an op 7 Reconnect", async () => {
    axiosGet.mockResolvedValue({ data: { url: "wss://gateway.discord" } });
    await startDiscordGateway();
    wsInstances[0].emit("message", Buffer.from(JSON.stringify({ op: 7 })));
    expect(wsInstances.length).toBe(2);
  });

  it("dispatches MESSAGE_CREATE events to the message handler", async () => {
    axiosGet.mockResolvedValue({ data: { url: "wss://gateway.discord" } });
    getTenantByDiscordChannelId.mockResolvedValue(null);
    await startDiscordGateway();
    const ws = wsInstances[0];
    ws.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          op: 0,
          t: "MESSAGE_CREATE",
          d: {
            id: "m1",
            channel_id: "other",
            author: { id: "u", bot: false },
            content: "hi",
            attachments: [],
          },
        }),
      ),
    );
    // The dispatch is fire-and-forget; flush the microtask queue.
    await Promise.resolve();
    expect(getTenantByDiscordChannelId).toHaveBeenCalledWith("other");
  });

  it("ignores malformed gateway frames and error events", async () => {
    axiosGet.mockResolvedValue({ data: { url: "wss://gateway.discord" } });
    await startDiscordGateway();
    const ws = wsInstances[0];
    expect(() => ws.emit("message", Buffer.from("not json"))).not.toThrow();
    expect(() => ws.emit("error", new Error("boom"))).not.toThrow();
  });

  it("reconnects after the socket closes", async () => {
    axiosGet.mockResolvedValue({ data: { url: "wss://gateway.discord" } });
    await startDiscordGateway();
    wsInstances[0].emit("close", 1006);
    vi.advanceTimersByTime(5000);
    expect(wsInstances.length).toBe(2);
  });

  it("retries when fetching the gateway URL fails", async () => {
    axiosGet.mockRejectedValue(new Error("no network"));
    await startDiscordGateway();
    expect(wsInstances).toHaveLength(0);
    axiosGet.mockResolvedValue({ data: { url: "wss://gateway.discord" } });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(wsInstances).toHaveLength(1);
  });
});
