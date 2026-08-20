export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?:
      | "audio/mpeg"
      | "audio/wav"
      | "application/pdf"
      | "audio/mp4"
      | "video/mp4";
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  model?: string;
  thinking?: Record<string, unknown>;
  reasoning?: Record<string, unknown>;
  // Groq reasoning-model controls (e.g. qwen/qwen3.6-27b). Reasoning models
  // default to reasoning ON, which — combined with json_object/json_schema
  // response formats — makes the model spend its output on reasoning tokens
  // that Groq strips from `content`, leaving empty content that fails JSON
  // validation (json_validate_failed with empty failed_generation). Pass
  // reasoningEffort: "none" on structured extraction calls to avoid that.
  //
  // Not every model accepts the parameter; a model that rejects it is handled
  // by the retry in invokeLLM rather than by the caller.
  reasoningEffort?: "none" | "default" | "low" | "medium" | "high";
  reasoning_effort?: "none" | "default" | "low" | "medium" | "high";
  reasoningFormat?: "parsed" | "raw" | "hidden";
  reasoning_format?: "parsed" | "raw" | "hidden";
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[],
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent,
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map((part) => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined,
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured",
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly",
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

const resolveApiUrl = () => {
  const base =
    process.env.LLM_BASE_URL ??
    process.env.OPENAI_BASE_URL ??
    "https://api.openai.com/v1";
  return `${base.replace(/\/+$/, "")}/chat/completions`;
};

const assertApiKey = () => {
  const key = process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "LLM_API_KEY (or OPENAI_API_KEY) is not set.\n" +
        "  OpenAI: set LLM_API_KEY=sk-...\n" +
        "  Groq:   set LLM_API_KEY=gsk_...\n" +
        "  Ollama: set LLM_API_KEY=ollama",
    );
  }
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object",
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

// Does a 400 body blame the reasoning controls? Providers word this
// differently ("unknown parameter", "unsupported value", "not supported"), so
// match on the parameter name itself and let the surrounding status carry the
// rest of the meaning.
export const mentionsReasoningParameter = (errorText: string): boolean =>
  /reasoning[_-]?(effort|format)/i.test(errorText);

const RETRY_MAX_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 500;
const RETRY_MAX_DELAY_MS = 30_000;

// A 429 is not an error in the sense the other retryable statuses are: it is
// the provider telling us, precisely, when to come back. Groq meters its
// vision models per minute (8,000 tokens/minute for qwen/qwen3.6-27b) and
// answers a burst with `retry-after: 7`. Four attempts on the generic ladder —
// which tops out well under a minute — can easily still land inside the same
// exhausted window, so rate limits get their own, longer budget and wait
// exactly as long as they were asked to.
const RATE_LIMIT_MAX_RETRIES = 8;
// A retry-after is honoured in full up to this bound. The clamp only exists so
// a bad header can't park a user-facing request indefinitely; it is far above
// any window a per-minute quota can produce.
const RATE_LIMIT_MAX_DELAY_MS = 120_000;
// Added on top of retry-after so a group of requests throttled together don't
// all resume on the same millisecond and re-trip the limit as one burst.
const RATE_LIMIT_JITTER_MS = 500;

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const parseRetryAfter = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
};

// Equal-jitter exponential backoff. The cap/2 floor guarantees a minimum
// delay so a misbehaving caller loop slows down instead of hammering the
// upstream while it keeps returning errors.
const computeBackoffDelay = (
  attempt: number,
  retryAfterMs?: number,
): number => {
  const cap = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
  const jittered = cap / 2 + Math.random() * (cap / 2);
  return Math.min(Math.max(jittered, retryAfterMs ?? 0), RETRY_MAX_DELAY_MS);
};

// When the provider named a time, wait it out in full — a shorter wait just
// spends another attempt landing in the same exhausted window. Only when there
// is no retry-after do we guess with the exponential ladder.
export const computeRateLimitDelay = (
  attempt: number,
  retryAfterMs?: number,
): number => {
  if (retryAfterMs !== undefined) {
    return Math.min(
      retryAfterMs + Math.random() * RATE_LIMIT_JITTER_MS,
      RATE_LIMIT_MAX_DELAY_MS,
    );
  }
  const cap = Math.min(
    RETRY_BASE_DELAY_MS * 2 ** attempt,
    RATE_LIMIT_MAX_DELAY_MS,
  );
  return cap / 2 + Math.random() * (cap / 2);
};

// Only a rate limit or a server-side fault can succeed on a retry. Every
// other non-2xx (400 malformed payload, 401 bad key, 404 unknown model, 422
// unsupported parameter) is deterministic: retrying it burns the full backoff
// ladder — roughly 30s — before surfacing the very same error to the caller,
// which on a user-facing request reads as a hang rather than a mistake.
export const isRetryableStatus = (status: number): boolean =>
  status === 429 || status >= 500;

const discardBody = async (response: Response) => {
  try {
    await response.body?.cancel();
  } catch {
    // Body already settled; nothing to clean up.
  }
};

// Retries rate-limited responses (on their own budget, honouring retry-after)
// and server/network errors (exponential backoff), then returns the final
// Response so callers keep their existing error handling.
const fetchWithBackoff = async (
  url: string,
  init: FetchInit,
): Promise<Response> => {
  let lastError: unknown;
  // Rate limits and faults are counted separately: a run of 429s must not eat
  // the attempts a genuine 503 later needs, or vice versa.
  let rateLimitRetries = 0;
  let errorRetries = 0;

  for (;;) {
    try {
      const response = await fetch(url, init);
      if (response.ok) return response;

      const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));

      if (response.status === 429) {
        if (rateLimitRetries >= RATE_LIMIT_MAX_RETRIES) return response;
        await discardBody(response);
        const delay = computeRateLimitDelay(rateLimitRetries, retryAfterMs);
        rateLimitRetries++;
        console.warn(
          `LLM request rate-limited, retry ${rateLimitRetries}/${RATE_LIMIT_MAX_RETRIES} in ${Math.round(delay)}ms`,
        );
        await sleep(delay);
        continue;
      }

      if (
        !isRetryableStatus(response.status) ||
        errorRetries >= RETRY_MAX_RETRIES
      ) {
        return response;
      }

      await discardBody(response);
      const delay = computeBackoffDelay(errorRetries, retryAfterMs);
      errorRetries++;
      console.warn(
        `LLM request retry ${errorRetries}/${RETRY_MAX_RETRIES} after status ${response.status}`,
      );
      await sleep(delay);
    } catch (error) {
      lastError = error;
      if (errorRetries >= RETRY_MAX_RETRIES) break;
      const delay = computeBackoffDelay(errorRetries);
      errorRetries++;
      console.warn(
        `LLM request retry ${errorRetries}/${RETRY_MAX_RETRIES} after network error`,
      );
      await sleep(delay);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("LLM request failed after exhausting retries");
};

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  assertApiKey();

  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    model,
    thinking,
    reasoning,
    reasoningEffort,
    reasoning_effort,
    reasoningFormat,
    reasoning_format,
    maxTokens,
    max_tokens,
  } = params;

  const payload: Record<string, unknown> = {
    messages: messages.map(normalizeMessage),
  };

  const resolvedModel =
    model ?? process.env.LLM_MODEL ?? process.env.OPENAI_MODEL;
  if (resolvedModel) {
    payload.model = resolvedModel;
  }

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools,
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  const resolvedMaxTokens = max_tokens ?? maxTokens;
  if (typeof resolvedMaxTokens === "number") {
    payload.max_tokens = resolvedMaxTokens;
  }

  if (thinking) {
    payload.thinking = thinking;
  }
  if (reasoning) {
    payload.reasoning = reasoning;
  }

  const resolvedReasoningEffort = reasoning_effort ?? reasoningEffort;
  if (resolvedReasoningEffort) {
    payload.reasoning_effort = resolvedReasoningEffort;
  }

  const resolvedReasoningFormat = reasoning_format ?? reasoningFormat;
  if (resolvedReasoningFormat) {
    payload.reasoning_format = resolvedReasoningFormat;
  }

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }

  const send = (body: Record<string, unknown>) =>
    fetchWithBackoff(resolveApiUrl(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY ?? ""}`,
      },
      body: JSON.stringify(body),
    });

  let response = await send(payload);

  // This project is deployed against whatever OpenAI-compatible endpoint the
  // operator configured — Groq, OpenAI, or a local Ollama — and only some
  // models accept reasoning controls. Rather than maintain a list of which
  // ones do, notice the rejection and repeat the call without them: callers
  // asking for reasoning_effort: "none" want the structured output to work,
  // not to insist on the parameter. A model that never wanted it is
  // unaffected either way.
  if (
    !response.ok &&
    response.status === 400 &&
    (payload.reasoning_effort !== undefined ||
      payload.reasoning_format !== undefined)
  ) {
    const errorText = await response.text();
    if (mentionsReasoningParameter(errorText)) {
      console.warn(
        `LLM model ${String(payload.model ?? "(default)")} rejected reasoning controls; retrying without them`,
      );
      const { reasoning_effort: _e, reasoning_format: _f, ...rest } = payload;
      response = await send(rest);
    } else {
      throw new Error(
        `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`,
      );
    }
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`,
    );
  }

  return (await response.json()) as InvokeResult;
}

export type ModelInfo = {
  id: string;
  object: string;
  created: number;
  owned_by: string;
};

export type ModelsResponse = {
  object: string;
  data: ModelInfo[];
};

export async function listLLMModels(): Promise<ModelsResponse> {
  assertApiKey();

  const base =
    process.env.LLM_BASE_URL ??
    process.env.OPENAI_BASE_URL ??
    "https://api.openai.com/v1";
  const url = `${base.replace(/\/+$/, "")}/models`;

  const response = await fetchWithBackoff(url, {
    headers: {
      authorization: `Bearer ${process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY ?? ""}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `List LLM models failed: ${response.status} ${response.statusText} – ${errorText}`,
    );
  }

  return (await response.json()) as ModelsResponse;
}
