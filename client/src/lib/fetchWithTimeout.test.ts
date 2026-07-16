import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFetchWithTimeout } from "./fetchWithTimeout";

describe("createFetchWithTimeout", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("passes through a successful response and forwards credentials", async () => {
    const response = new Response("ok");
    const fetchMock = vi.fn().mockResolvedValue(response);
    globalThis.fetch = fetchMock;

    const fetchWithTimeout = createFetchWithTimeout(1000);
    const result = await fetchWithTimeout("/api/trpc");

    expect(result).toBe(response);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.credentials).toBe("include");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("aborts the underlying fetch once the timeout elapses", async () => {
    const fetchMock = vi.fn((_input, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });
    globalThis.fetch = fetchMock;

    const fetchWithTimeout = createFetchWithTimeout(5000);
    const promise = fetchWithTimeout("/api/trpc");
    const assertion = expect(promise).rejects.toThrow();

    await vi.advanceTimersByTimeAsync(5000);
    await assertion;

    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal?.aborted).toBe(true);
  });

  it("forwards an externally aborted signal to the underlying fetch", async () => {
    const fetchMock = vi.fn((_input, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });
    globalThis.fetch = fetchMock;

    const external = new AbortController();
    const fetchWithTimeout = createFetchWithTimeout(60_000);
    const promise = fetchWithTimeout("/api/trpc", { signal: external.signal });
    const assertion = expect(promise).rejects.toThrow();

    external.abort();
    await assertion;
  });

  it("uses the default timeout when none is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    globalThis.fetch = fetchMock;

    const fetchWithTimeout = createFetchWithTimeout();
    await fetchWithTimeout("/api/trpc");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
