import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { ENV } = vi.hoisted(() => ({
  ENV: { forgeApiUrl: "", forgeApiKey: "" } as {
    forgeApiUrl: string;
    forgeApiKey: string;
  },
}));

vi.mock("./env", () => ({ ENV }));

import { transcribeAudio } from "./voiceTranscription";

type DownloadCfg = {
  ok?: boolean;
  status?: number;
  contentType?: string;
  bytes?: number;
  throws?: boolean;
};
type TranscribeCfg = {
  ok?: boolean;
  status?: number;
  json?: unknown;
  text?: string;
};

function stubFetch(download: DownloadCfg = {}, transcribe: TranscribeCfg = {}) {
  const fetchSpy = vi.fn(async (url: string) => {
    if (String(url).includes("v1/audio/transcriptions")) {
      return {
        ok: transcribe.ok ?? true,
        status: transcribe.status ?? 200,
        statusText: "OK",
        json: async () =>
          transcribe.json ?? {
            task: "transcribe",
            language: "en",
            duration: 1,
            text: "hello world",
            segments: [],
          },
        text: async () => transcribe.text ?? "",
      };
    }
    // audio download
    if (download.throws) throw new Error("network down");
    return {
      ok: download.ok ?? true,
      status: download.status ?? 200,
      statusText: "OK",
      arrayBuffer: async () => new ArrayBuffer(download.bytes ?? 1024),
      headers: {
        get: () => download.contentType ?? "audio/webm",
      },
    };
  });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

beforeEach(() => {
  ENV.forgeApiUrl = "https://forge.example";
  ENV.forgeApiKey = "forge-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("transcribeAudio", () => {
  it("reports a service error when the URL is not configured", async () => {
    ENV.forgeApiUrl = "";
    const res = await transcribeAudio({ audioUrl: "https://x/a.webm" });
    expect(res).toMatchObject({ code: "SERVICE_ERROR" });
  });

  it("reports a service error when the key is not configured", async () => {
    ENV.forgeApiKey = "";
    const res = await transcribeAudio({ audioUrl: "https://x/a.webm" });
    expect(res).toMatchObject({ code: "SERVICE_ERROR" });
  });

  it("returns INVALID_FORMAT when the audio download fails", async () => {
    stubFetch({ ok: false, status: 404 });
    const res = await transcribeAudio({ audioUrl: "https://x/a.webm" });
    expect(res).toMatchObject({ code: "INVALID_FORMAT" });
  });

  it("returns SERVICE_ERROR when the audio download throws", async () => {
    stubFetch({ throws: true });
    const res = await transcribeAudio({ audioUrl: "https://x/a.webm" });
    expect(res).toMatchObject({ code: "SERVICE_ERROR" });
  });

  it("returns FILE_TOO_LARGE for audio above 16MB", async () => {
    stubFetch({ bytes: 17 * 1024 * 1024 });
    const res = await transcribeAudio({ audioUrl: "https://x/a.webm" });
    expect(res).toMatchObject({ code: "FILE_TOO_LARGE" });
  });

  it("returns TRANSCRIPTION_FAILED when the service errors", async () => {
    stubFetch({}, { ok: false, status: 500, text: "boom" });
    const res = await transcribeAudio({ audioUrl: "https://x/a.webm" });
    expect(res).toMatchObject({ code: "TRANSCRIPTION_FAILED" });
  });

  it("returns SERVICE_ERROR when the response has no text", async () => {
    stubFetch({}, { json: { task: "transcribe", segments: [] } });
    const res = await transcribeAudio({ audioUrl: "https://x/a.webm" });
    expect(res).toMatchObject({ code: "SERVICE_ERROR" });
  });

  it("returns the Whisper response on success", async () => {
    stubFetch({ contentType: "audio/mp3" });
    const res = await transcribeAudio({ audioUrl: "https://x/a.mp3" });
    expect(res).toMatchObject({ text: "hello world", language: "en" });
  });

  it("builds a language-specific prompt when a language is given", async () => {
    const fetchSpy = stubFetch({ contentType: "audio/wav" });
    await transcribeAudio({ audioUrl: "https://x/a.wav", language: "de" });
    // Two fetches: audio download + transcription POST.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("uses a custom prompt when supplied and an unknown mime type", async () => {
    stubFetch({ contentType: "audio/x-weird" });
    const res = await transcribeAudio({
      audioUrl: "https://x/a.bin",
      prompt: "Transcribe the meeting",
    });
    expect(res).toMatchObject({ text: "hello world" });
  });
});
