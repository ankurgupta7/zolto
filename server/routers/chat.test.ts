import { describe, it, expect, vi, beforeEach } from "vitest";

const dbMock = vi.hoisted(() => ({
  getVisibleProducts: vi.fn(),
  getTenantSettings: vi.fn(),
}));

const llmMock = vi.hoisted(() => ({
  invokeLLM: vi.fn(),
}));

vi.mock("../db", () => dbMock);
vi.mock("../_core/llm", () => llmMock);

import { chatRouter } from "./chat";
import type { TrpcContext } from "../_core/context";

const tenant = {
  id: 42,
  slug: "aurora",
  name: "Aurora Atelier",
  plan: "maker",
} as never;

function ctx(): TrpcContext {
  return {
    req: { headers: {} } as never,
    res: {} as never,
    user: null,
    tenant,
  } as never;
}

const caller = chatRouter.createCaller(ctx());

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.getTenantSettings.mockResolvedValue({
    currency: "chf",
    whatsappNumber: "+41 79 000 00 00",
    contactEmail: "hi@aurora.example",
  });
  dbMock.getVisibleProducts.mockResolvedValue([
    {
      id: 1,
      name: "Silberring",
      nameEn: "Silver ring",
      description: "Handgefertigt",
      descriptionEn: "Handcrafted",
      nameDe: null,
      descriptionDe: null,
      nameFr: "Bague en argent",
      descriptionFr: "Faite à la main",
      nameIt: null,
      descriptionIt: null,
      price: "129.00",
      sold: false,
      quantity: 1,
    },
    {
      id: 2,
      name: "Verkauft",
      nameEn: "Sold piece",
      description: "Weg",
      descriptionEn: "Gone",
      price: "99.00",
      sold: true,
      quantity: 0,
    },
  ]);
  llmMock.invokeLLM.mockResolvedValue({
    choices: [{ message: { content: "The Silver ring is 129.00 CHF." } }],
  });
});

describe("chat.ask", () => {
  it("returns the LLM reply", async () => {
    const res = await caller.ask({ message: "Do you have rings?" });
    expect(res.reply).toContain("Silver ring");
  });

  it("grounds the system prompt in the in-stock catalog and contact info", async () => {
    await caller.ask({ message: "What do you sell?" });
    const call = llmMock.invokeLLM.mock.calls[0][0];
    const system = call.messages[0].content as string;
    expect(system).toContain("Aurora Atelier");
    expect(system).toContain("never invent products");
    expect(system).toContain("Silver ring (129.00 CHF)");
    expect(system).toContain("WhatsApp: +41 79 000 00 00");
    // sold-out items are excluded from the catalog
    expect(system).not.toContain("Sold piece");
  });

  it("grounds catalog lines in the visitor's locale (fr)", async () => {
    await caller.ask({ message: "Avez-vous des bagues?", locale: "fr" });
    const system = llmMock.invokeLLM.mock.calls[0][0].messages[0]
      .content as string;
    expect(system).toContain("Bague en argent (129.00 CHF)");
    expect(system).toContain("Faite à la main");
    expect(system).not.toContain("Silver ring (129.00 CHF)");
  });

  it("falls back to the primary text when a locale translation is missing (it)", async () => {
    await caller.ask({ message: "Avete anelli?", locale: "it" });
    const system = llmMock.invokeLLM.mock.calls[0][0].messages[0]
      .content as string;
    expect(system).toContain("Silberring (129.00 CHF)");
    expect(system).toContain("Handgefertigt");
  });

  it("defaults to English catalog lines when no locale is sent", async () => {
    await caller.ask({ message: "What do you sell?" });
    const system = llmMock.invokeLLM.mock.calls[0][0].messages[0]
      .content as string;
    expect(system).toContain("Silver ring (129.00 CHF)");
  });

  it("instructs the model to reply in the customer's language", async () => {
    await caller.ask({ message: "Bonjour" });
    const system = llmMock.invokeLLM.mock.calls[0][0].messages[0]
      .content as string;
    expect(system).toContain("Reply in the language the customer writes in");
  });

  it("forwards conversation history before the new message", async () => {
    await caller.ask({
      message: "And in gold?",
      history: [
        { role: "user", content: "Show me rings" },
        { role: "assistant", content: "Here is the Silver ring." },
      ],
    });
    const msgs = llmMock.invokeLLM.mock.calls[0][0].messages;
    expect(msgs[msgs.length - 3]).toEqual({
      role: "user",
      content: "Show me rings",
    });
    expect(msgs[msgs.length - 2]).toEqual({
      role: "assistant",
      content: "Here is the Silver ring.",
    });
    expect(msgs[msgs.length - 1]).toEqual({
      role: "user",
      content: "And in gold?",
    });
  });

  it("handles content-part LLM responses", async () => {
    llmMock.invokeLLM.mockResolvedValue({
      choices: [{ message: { content: [{ type: "text", text: "Hallo!" }] } }],
    });
    const res = await caller.ask({ message: "Hallo" });
    expect(res.reply).toBe("Hallo!");
  });

  it("throws a friendly error when the LLM call fails", async () => {
    llmMock.invokeLLM.mockRejectedValue(new Error("boom"));
    await expect(caller.ask({ message: "Hi" })).rejects.toThrow(
      /unavailable right now/,
    );
  });

  it("throws when the LLM returns an empty reply", async () => {
    llmMock.invokeLLM.mockResolvedValue({
      choices: [{ message: { content: "   " } }],
    });
    await expect(caller.ask({ message: "Hi" })).rejects.toThrow(
      /didn't answer/,
    );
  });

  it("handles an empty catalog gracefully", async () => {
    dbMock.getVisibleProducts.mockResolvedValue([]);
    await caller.ask({ message: "Anything?" });
    const system = llmMock.invokeLLM.mock.calls[0][0].messages[0]
      .content as string;
    expect(system).toContain("no products listed online");
  });
});
