import { describe, it, expect } from "vitest";
import { buildPosPairingPayload, parsePosPairingPayload } from "./posPairing";

describe("POS pairing payload", () => {
  it("round-trips through build → parse", () => {
    const text = buildPosPairingPayload("https://gwinn.ch", "pos_abc123");
    expect(parsePosPairingPayload(text)).toEqual({
      platformPos: 1,
      baseUrl: "https://gwinn.ch",
      key: "pos_abc123",
    });
  });

  it("normalises a trailing slash off the origin", () => {
    const text = buildPosPairingPayload("https://gwinn.ch/", "k12345678");
    expect(parsePosPairingPayload(text)?.baseUrl).toBe("https://gwinn.ch");
  });

  it("refuses a non-origin base URL", () => {
    expect(() => buildPosPairingPayload("gwinn.ch", "k12345678")).toThrow(
      /origin/i,
    );
    expect(() =>
      buildPosPairingPayload("https://gwinn.ch/admin", "k12345678"),
    ).toThrow(/origin/i);
  });

  it("refuses an empty key", () => {
    expect(() => buildPosPairingPayload("https://gwinn.ch", "  ")).toThrow(
      /empty/i,
    );
  });

  it("rejects foreign QR content on parse", () => {
    expect(parsePosPairingPayload("https://evil.example/x")).toBeNull();
    expect(
      parsePosPairingPayload('{"platformPos":2,"baseUrl":"x","key":"y"}'),
    ).toBeNull();
    expect(parsePosPairingPayload('{"baseUrl":"x"}')).toBeNull();
    expect(parsePosPairingPayload("not json")).toBeNull();
  });
});
