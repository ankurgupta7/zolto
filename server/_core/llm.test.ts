import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { invokeLLM, listLLMModels, type Message } from "./llm";

const ENV_KEYS = [
  "LLM_API_KEY",
  "OPENAI_API_KEY",
  "LLM_BASE_URL",
  "OPENAI_BASE_URL",
  "LLM_MODEL",
  "OPENAI_MODEL",
] as const;
const saved: Record<string, string | undefined> = {};

function okResponse(json: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => json,
    text: async () => "",
    headers: { get: () => null },
    body: { cancel: async () => {} },
  };
}

function errResponse(status = 500, retryAfter: string | null = null) {
  return {
    ok: false,
    status,
    statusText: "Server Error",
    json: async () => ({}),
    text: async () => "upstream boom",
    headers: { get: (h: string) => (h === "retry-after" ? retryAfter : null) },
    body: { cancel: async () => {} },
  };
}

function lastPayload(fetchSpy: ReturnType<typeof vi.fn>) {
  return JSON.parse(fetchSpy.mock.calls.at(-1)![1].body);
}

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.LLM_API_KEY = "sk-test";
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("invokeLLM configuration", () => {
  it("throws when no API key is configured", async () => {
    delete process.env.LLM_API_KEY;
    await expect(invokeLLM({ messages: [] })).rejects.toThrow(/LLM_API_KEY/);
  });

  it("collapses a single text message to a string and posts to the chat endpoint", async () => {
    const fetchSpy = vi.fn(async () => okResponse({ id: "1", choices: [] }));
    vi.stubGlobal("fetch", fetchSpy);

    await invokeLLM({ messages: [{ role: "user", content: "hi" }] });

    expect(fetchSpy.mock.calls[0][0]).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
    expect(lastPayload(fetchSpy).messages[0]).toEqual({
      role: "user",
      content: "hi",
    });
  });

  it("normalizes multimodal, tool, and file content parts", async () => {
    const fetchSpy = vi.fn(async () => okResponse({ id: "1", choices: [] }));
    vi.stubGlobal("fetch", fetchSpy);

    const messages: Message[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "look" },
          { type: "image_url", image_url: { url: "https://x/y.png" } },
          { type: "file_url", file_url: { url: "https://x/y.pdf" } },
        ],
      },
      {
        role: "tool",
        tool_call_id: "t1",
        content: [{ type: "text", text: "r" }],
      },
    ];
    await invokeLLM({ messages });

    const sent = lastPayload(fetchSpy).messages;
    expect(Array.isArray(sent[0].content)).toBe(true);
    expect(sent[0].content).toHaveLength(3);
    expect(sent[1]).toMatchObject({ role: "tool", tool_call_id: "t1" });
  });

  it("throws on an unsupported content part", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(
      invokeLLM({
        messages: [{ role: "user", content: [{ type: "bogus" } as never] }],
      }),
    ).rejects.toThrow(/Unsupported message content part/);
  });

  it("resolves the model from params then env", async () => {
    const fetchSpy = vi.fn(async () => okResponse({ id: "1", choices: [] }));
    vi.stubGlobal("fetch", fetchSpy);
    await invokeLLM({ messages: [], model: "gpt-x" });
    expect(lastPayload(fetchSpy).model).toBe("gpt-x");

    process.env.LLM_MODEL = "env-model";
    await invokeLLM({ messages: [] });
    expect(lastPayload(fetchSpy).model).toBe("env-model");
  });

  it("passes through tokens, thinking and reasoning options", async () => {
    const fetchSpy = vi.fn(async () => okResponse({ id: "1", choices: [] }));
    vi.stubGlobal("fetch", fetchSpy);
    await invokeLLM({
      messages: [],
      max_tokens: 256,
      thinking: { budget: 1 },
      reasoning: { effort: "high" },
    });
    const payload = lastPayload(fetchSpy);
    expect(payload.max_tokens).toBe(256);
    expect(payload.thinking).toEqual({ budget: 1 });
    expect(payload.reasoning).toEqual({ effort: "high" });
  });
});

describe("invokeLLM tool_choice", () => {
  function run(params: Parameters<typeof invokeLLM>[0]) {
    const fetchSpy = vi.fn(async () => okResponse({ id: "1", choices: [] }));
    vi.stubGlobal("fetch", fetchSpy);
    return invokeLLM(params).then(() => lastPayload(fetchSpy));
  }
  const tool = {
    type: "function" as const,
    function: { name: "get_weather" },
  };

  it("passes 'auto' and 'none' through", async () => {
    expect((await run({ messages: [], toolChoice: "auto" })).tool_choice).toBe(
      "auto",
    );
    expect((await run({ messages: [], toolChoice: "none" })).tool_choice).toBe(
      "none",
    );
  });

  it("expands 'required' with a single tool to an explicit choice", async () => {
    const payload = await run({
      messages: [],
      tools: [tool],
      toolChoice: "required",
    });
    expect(payload.tool_choice).toEqual({
      type: "function",
      function: { name: "get_weather" },
    });
  });

  it("rejects 'required' with no tools", async () => {
    await expect(
      invokeLLM({ messages: [], toolChoice: "required" }),
    ).rejects.toThrow(/no tools were configured/);
  });

  it("rejects 'required' with multiple tools", async () => {
    await expect(
      invokeLLM({
        messages: [],
        tools: [tool, { type: "function", function: { name: "other" } }],
        toolChoice: "required",
      }),
    ).rejects.toThrow(/single tool/);
  });

  it("maps a by-name choice to an explicit function choice", async () => {
    const payload = await run({
      messages: [],
      tools: [tool],
      toolChoice: { name: "get_weather" },
    });
    expect(payload.tool_choice).toEqual({
      type: "function",
      function: { name: "get_weather" },
    });
  });

  it("passes an explicit function choice through unchanged", async () => {
    const explicit = { type: "function" as const, function: { name: "x" } };
    const payload = await run({
      messages: [],
      tools: [tool],
      tool_choice: explicit,
    });
    expect(payload.tool_choice).toEqual(explicit);
  });
});

describe("invokeLLM response_format", () => {
  function run(params: Parameters<typeof invokeLLM>[0]) {
    const fetchSpy = vi.fn(async () => okResponse({ id: "1", choices: [] }));
    vi.stubGlobal("fetch", fetchSpy);
    return invokeLLM(params).then(() => lastPayload(fetchSpy));
  }

  it("derives a json_schema response format from outputSchema", async () => {
    const payload = await run({
      messages: [],
      outputSchema: { name: "s", schema: { type: "object" }, strict: true },
    });
    expect(payload.response_format).toMatchObject({
      type: "json_schema",
      json_schema: { name: "s", strict: true },
    });
  });

  it("passes an explicit response_format through", async () => {
    const payload = await run({
      messages: [],
      response_format: { type: "json_object" },
    });
    expect(payload.response_format).toEqual({ type: "json_object" });
  });

  it("rejects a json_schema format without a schema", async () => {
    await expect(
      invokeLLM({
        messages: [],
        responseFormat: {
          type: "json_schema",
          json_schema: { name: "s" } as never,
        },
      }),
    ).rejects.toThrow(/requires a defined schema/);
  });

  it("rejects an outputSchema missing name or schema", async () => {
    await expect(
      invokeLLM({ messages: [], outputSchema: { name: "s" } as never }),
    ).rejects.toThrow(/requires both name and schema/);
  });
});

describe("invokeLLM errors & retries", () => {
  it("throws with detail on a non-retryable failure after exhausting retries", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => errResponse(500)),
    );
    const p = invokeLLM({ messages: [] });
    const assertion = expect(p).rejects.toThrow(/LLM invoke failed: 500/);
    await vi.runAllTimersAsync();
    await assertion;
  });

  it("retries a failed request and returns the eventual success", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(errResponse(503, "1"))
      .mockResolvedValueOnce(okResponse({ id: "ok", choices: [] }));
    vi.stubGlobal("fetch", fetchSpy);

    const p = invokeLLM({ messages: [] });
    await vi.runAllTimersAsync();
    const res = await p;
    expect(res).toMatchObject({ id: "ok" });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("retries network errors and rethrows after the final attempt", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNRESET");
      }),
    );
    const p = invokeLLM({ messages: [] });
    const assertion = expect(p).rejects.toThrow(/ECONNRESET/);
    await vi.runAllTimersAsync();
    await assertion;
  });
});

describe("listLLMModels", () => {
  it("throws without an API key", async () => {
    delete process.env.LLM_API_KEY;
    await expect(listLLMModels()).rejects.toThrow(/LLM_API_KEY/);
  });

  it("returns the model list from a custom base URL", async () => {
    process.env.LLM_BASE_URL = "https://groq.example/v1/";
    const fetchSpy = vi.fn(async () =>
      okResponse({ object: "list", data: [{ id: "m1" }] }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const res = await listLLMModels();
    expect(res.data[0].id).toBe("m1");
    expect(fetchSpy.mock.calls[0][0]).toBe("https://groq.example/v1/models");
  });

  it("throws with detail when the models request fails", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => errResponse(401)),
    );
    const p = listLLMModels();
    const assertion = expect(p).rejects.toThrow(/List LLM models failed: 401/);
    await vi.runAllTimersAsync();
    await assertion;
  });
});
