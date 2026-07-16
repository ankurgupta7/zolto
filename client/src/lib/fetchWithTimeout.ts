// A stuck request (dropped connection, wedged server-side query) would
// otherwise leave the caller's UI spinning forever, since fetch has no
// default timeout. Abort after the given timeout so every call settles —
// success or a clear, retryable error — instead of hanging indefinitely.
export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

export function createFetchWithTimeout(
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS
) {
  return function fetchWithTimeout(
    input: Parameters<typeof fetch>[0],
    init?: RequestInit
  ) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const forwardAbort = () => controller.abort();
    init?.signal?.addEventListener("abort", forwardAbort);

    return globalThis
      .fetch(input, {
        ...(init ?? {}),
        credentials: "include",
        signal: controller.signal,
      })
      .finally(() => {
        clearTimeout(timer);
        init?.signal?.removeEventListener("abort", forwardAbort);
      });
  };
}
