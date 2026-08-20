import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  computeRateLimitDelay,
  invokeLLM,
  isRetryableStatus,
  listLLMModels,
  mentionsReasoningParameter,
  type Message,
} from "./llm";

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
  it("throws with detail on a server error after exhausting retries", async () => {
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

describe("isRetryableStatus", () => {
  it("treats rate limiting and server faults as retryable", () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
  });

  it("treats deterministic client errors as non-retryable", () => {
    for (const status of [400, 401, 403, 404, 413, 422]) {
      expect(isRetryableStatus(status)).toBe(false);
    }
  });
});

describe("invokeLLM non-retryable errors", () => {
  it("surfaces a 400 immediately instead of burning the backoff ladder", async () => {
    // A malformed request fails identically every time; retrying it only
    // delays the same error by ~30s, which reads as a hang.
    const fetchSpy = vi.fn(async () => errResponse(400));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(invokeLLM({ messages: [] })).rejects.toThrow(
      /LLM invoke failed: 400/,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 404, 422])("does not retry a %i", async (status) => {
    const fetchSpy = vi.fn(async () => errResponse(status));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(invokeLLM({ messages: [] })).rejects.toThrow(String(status));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("computeRateLimitDelay", () => {
  it("waits at least as long as the provider asked", () => {
    // Groq answers a vision burst with `retry-after: 7`.
    expect(computeRateLimitDelay(0, 7000)).toBeGreaterThanOrEqual(7000);
  });

  it("adds only a small jitter on top of retry-after", () => {
    for (let attempt = 0; attempt < 8; attempt++) {
      expect(computeRateLimitDelay(attempt, 7000)).toBeLessThanOrEqual(7500);
    }
  });

  it("does not shorten a long retry-after into the same exhausted window", () => {
    expect(computeRateLimitDelay(0, 55_000)).toBeGreaterThanOrEqual(55_000);
  });

  it("backs off exponentially when no retry-after is given", () => {
    expect(computeRateLimitDelay(5)).toBeGreaterThan(computeRateLimitDelay(0));
  });

  it("bounds even an absurd retry-after so a request cannot hang forever", () => {
    expect(computeRateLimitDelay(0, 86_400_000)).toBeLessThanOrEqual(120_000);
  });
});

describe("invokeLLM rate-limit retries", () => {
  it("keeps retrying a 429 past the budget a server error would get", async () => {
    vi.useFakeTimers();
    // Six 429s — more than RETRY_MAX_RETRIES (4), which is what a burst
    // against an 8,000 tokens/minute budget actually produces.
    const fetchSpy = vi.fn();
    for (let i = 0; i < 6; i++)
      fetchSpy.mockResolvedValueOnce(errResponse(429, "0"));
    fetchSpy.mockResolvedValueOnce(okResponse({ id: "ok", choices: [] }));
    vi.stubGlobal("fetch", fetchSpy);

    const p = invokeLLM({ messages: [] });
    await vi.runAllTimersAsync();
    await expect(p).resolves.toMatchObject({ id: "ok" });
    expect(fetchSpy).toHaveBeenCalledTimes(7);
  });

  it("gives up on a persistent 429 rather than retrying forever", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async () => errResponse(429, "0"));
    vi.stubGlobal("fetch", fetchSpy);

    const p = invokeLLM({ messages: [] });
    const assertion = expect(p).rejects.toThrow(/429/);
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchSpy).toHaveBeenCalledTimes(9); // 1 attempt + 8 retries
  });

  it("spends rate-limit and server-error budgets independently", async () => {
    vi.useFakeTimers();
    // Five 429s (past the 4-attempt error budget) then a 503: the 429s must
    // not have consumed the attempts the 503 needs.
    const fetchSpy = vi.fn();
    for (let i = 0; i < 5; i++)
      fetchSpy.mockResolvedValueOnce(errResponse(429, "0"));
    fetchSpy.mockResolvedValueOnce(errResponse(503, "0"));
    fetchSpy.mockResolvedValueOnce(okResponse({ id: "ok", choices: [] }));
    vi.stubGlobal("fetch", fetchSpy);

    const p = invokeLLM({ messages: [] });
    await vi.runAllTimersAsync();
    await expect(p).resolves.toMatchObject({ id: "ok" });
    expect(fetchSpy).toHaveBeenCalledTimes(7);
  });

  it("waits the retry-after the provider named, not its own first rung", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(errResponse(429, "7"))
      .mockResolvedValueOnce(okResponse({ id: "ok", choices: [] }));
    vi.stubGlobal("fetch", fetchSpy);

    const p = invokeLLM({ messages: [] });

    // Well past the generic ladder's first rung, but short of retry-after.
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(6000);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    await p;
  });
});

describe("reasoning controls", () => {
  it("forwards reasoning_effort into the request payload", async () => {
    const fetchSpy = vi.fn(async () => okResponse({ id: "ok", choices: [] }));
    vi.stubGlobal("fetch", fetchSpy);

    await invokeLLM({ messages: [], reasoning_effort: "none" });
    expect(lastPayload(fetchSpy).reasoning_effort).toBe("none");
  });

  it("accepts the camelCase alias", async () => {
    const fetchSpy = vi.fn(async () => okResponse({ id: "ok", choices: [] }));
    vi.stubGlobal("fetch", fetchSpy);

    await invokeLLM({ messages: [], reasoningEffort: "none" });
    expect(lastPayload(fetchSpy).reasoning_effort).toBe("none");
  });

  it("omits the reasoning fields when not asked for", async () => {
    const fetchSpy = vi.fn(async () => okResponse({ id: "ok", choices: [] }));
    vi.stubGlobal("fetch", fetchSpy);

    await invokeLLM({ messages: [] });
    expect(lastPayload(fetchSpy)).not.toHaveProperty("reasoning_effort");
    expect(lastPayload(fetchSpy)).not.toHaveProperty("reasoning_format");
  });
});

describe("mentionsReasoningParameter", () => {
  it("recognises the parameter however a provider words the rejection", () => {
    for (const body of [
      '{"error":{"message":"Unknown parameter: reasoning_effort"}}',
      "model does not support reasoning_effort",
      "'reasoning-format' is not supported for this model",
      "Unsupported value for REASONING_EFFORT",
    ]) {
      expect(mentionsReasoningParameter(body)).toBe(true);
    }
  });

  it("does not claim an unrelated 400", () => {
    expect(mentionsReasoningParameter("invalid response_format")).toBe(false);
    expect(mentionsReasoningParameter("context length exceeded")).toBe(false);
  });
});

describe("invokeLLM reasoning-parameter compatibility", () => {
  it("retries without reasoning controls when the model rejects them", async () => {
    // This project runs against whatever OpenAI-compatible endpoint the
    // operator configured, and only some models take reasoning controls.
    const reject = {
      ...errResponse(400),
      text: async () =>
        '{"error":{"message":"Unknown parameter: reasoning_effort"}}',
    };
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(reject)
      .mockResolvedValueOnce(okResponse({ id: "ok", choices: [] }));
    vi.stubGlobal("fetch", fetchSpy);

    const res = await invokeLLM({
      messages: [],
      reasoning_effort: "none",
      response_format: { type: "json_object" },
    });

    expect(res).toMatchObject({ id: "ok" });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const retried = lastPayload(fetchSpy);
    expect(retried).not.toHaveProperty("reasoning_effort");
    // Everything else about the request survives the retry.
    expect(retried.response_format).toEqual({ type: "json_object" });
  });

  it("does not retry a 400 that has nothing to do with reasoning", async () => {
    const fetchSpy = vi.fn(async () => errResponse(400));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      invokeLLM({ messages: [], reasoning_effort: "none" }),
    ).rejects.toThrow(/LLM invoke failed: 400/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("does not retry when no reasoning control was sent", async () => {
    const reject = {
      ...errResponse(400),
      text: async () => "Unknown parameter: reasoning_effort",
    };
    const fetchSpy = vi.fn(async () => reject);
    vi.stubGlobal("fetch", fetchSpy);

    await expect(invokeLLM({ messages: [] })).rejects.toThrow(/400/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("surfaces a failure on the retry rather than masking it", async () => {
    const reject = {
      ...errResponse(400),
      text: async () => "Unknown parameter: reasoning_effort",
    };
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(reject)
      .mockResolvedValueOnce(errResponse(401));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      invokeLLM({ messages: [], reasoning_effort: "none" }),
    ).rejects.toThrow(/401/);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
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
