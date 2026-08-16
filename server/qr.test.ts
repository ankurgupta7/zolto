import { describe, expect, it } from "vitest";
import { renderQrDataUrl } from "./qr";

describe("renderQrDataUrl", () => {
  it("encodes a URL as a PNG data URL", async () => {
    const dataUrl = await renderQrDataUrl(
      "https://checkout.stripe.com/c/pay/cs_test_abc123"
    );
    expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
    // A real code is several kilobytes; a truncated or blank render is not.
    expect(dataUrl.length).toBeGreaterThan(500);
  });

  it("produces a different code for a different URL", async () => {
    const [a, b] = await Promise.all([
      renderQrDataUrl("https://example.com/a"),
      renderQrDataUrl("https://example.com/b"),
    ]);
    expect(a).not.toBe(b);
  });

  it("refuses an empty string rather than rendering a blank square", async () => {
    // A blank square on the till reads to a cashier as "still loading", not
    // "this sale is broken" — so this has to fail where it can be seen.
    await expect(renderQrDataUrl("")).rejects.toThrow(/empty string/i);
    await expect(renderQrDataUrl("   ")).rejects.toThrow(/empty string/i);
  });
});
