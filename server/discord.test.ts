import { describe, expect, it, vi, beforeEach } from "vitest";

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

import { parseProductFromMessage } from "./discord";

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
        })
      )
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
        })
      )
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
        })
      )
    );
    await parseProductFromMessage("Gold drop earrings, CHF 150");

    const call = invokeLLM.mock.calls[0][0];
    const userMessage = call.messages.find(
      (m: { role: string }) => m.role === "user"
    );
    expect(userMessage.content).toContain("Gold drop earrings, CHF 150");
  });
});
