import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildReceiptHtml,
  buildReconciliationReviewHtml,
  escapeHtml,
  sendReconciliationReviewEmail,
  type OrderReceiptOptions,
  type ReconciliationReviewItem,
} from "./email";

describe("escapeHtml", () => {
  it("escapes the five reserved HTML characters", () => {
    expect(escapeHtml(`<script>alert('xss')&"hi"</script>`)).toBe(
      "&lt;script&gt;alert(&#39;xss&#39;)&amp;&quot;hi&quot;&lt;/script&gt;",
    );
  });

  it("leaves plain text untouched", () => {
    expect(escapeHtml("Jane Doe")).toBe("Jane Doe");
  });
});

describe("buildReceiptHtml", () => {
  const baseOpts: OrderReceiptOptions = {
    to: "jane@example.com",
    customerName: "Jane Doe",
    orderRef: 42,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    items: [
      {
        id: 1,
        name: "Goldkette",
        nameEn: "Gold Necklace",
        price: "120.00",
        imageUrl: null,
      },
    ],
    amountTotal: 12000,
    paymentMethod: "card",
  };

  it("escapes a malicious customer name so it cannot inject markup", () => {
    const html = buildReceiptHtml({
      ...baseOpts,
      customerName: `<img src=x onerror=alert(1)>`,
    });
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("escapes a malicious email address", () => {
    const html = buildReceiptHtml({
      ...baseOpts,
      to: `"><script>alert(1)</script>`,
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapes a malicious payment method", () => {
    const html = buildReceiptHtml({
      ...baseOpts,
      paymentMethod: `<svg onload=alert(1)>`,
    });
    expect(html).not.toContain("<svg onload=alert(1)>");
    expect(html).toContain("&lt;svg onload=alert(1)&gt;");
  });

  it("escapes a malicious product label", () => {
    const html = buildReceiptHtml({
      ...baseOpts,
      items: [
        {
          id: 1,
          name: "Goldkette",
          nameEn: `<script>alert(1)</script>`,
          price: "120.00",
          imageUrl: null,
        },
      ],
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("renders normal receipt data without alteration", () => {
    const html = buildReceiptHtml(baseOpts);
    expect(html).toContain("Jane Doe");
    expect(html).toContain("jane@example.com");
    expect(html).toContain("Gold Necklace");
    expect(html).toContain("CHF 120.00");
    expect(html).toContain("#00042");
  });
});

describe("buildReconciliationReviewHtml", () => {
  const baseItem: ReconciliationReviewItem = {
    paymentIntentId: "pi_test_1",
    amountRappen: 10000,
    currency: "chf",
    stripeCreatedAt: new Date("2026-02-01T10:00:00Z"),
    candidates: [
      { id: 7, name: "Silberring", nameEn: "Silver Ring", price: "100.00" },
      { id: 8, name: "Goldring", nameEn: null, price: "98.00" },
    ],
    token: "abc123",
  };

  it("includes a per-candidate assign link carrying the token and choice index", () => {
    const html = buildReconciliationReviewHtml([baseItem]);
    expect(html).toContain("/api/reconciliation/confirm?token=abc123&choice=0");
    expect(html).toContain("/api/reconciliation/confirm?token=abc123&choice=1");
    expect(html).toContain(
      "/api/reconciliation/confirm?token=abc123&choice=none",
    );
  });

  it("prefers the English name when present and falls back to the local name", () => {
    const html = buildReconciliationReviewHtml([baseItem]);
    expect(html).toContain("Silver Ring");
    expect(html).toContain("Goldring");
  });

  it("escapes a malicious payment intent id", () => {
    const html = buildReconciliationReviewHtml([
      { ...baseItem, paymentIntentId: `<script>alert(1)</script>` },
    ]);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("renders the charged amount in CHF", () => {
    const html = buildReconciliationReviewHtml([baseItem]);
    expect(html).toContain("CHF 100.00");
  });

  it("combines multiple items into one email", () => {
    const html = buildReconciliationReviewHtml([
      baseItem,
      { ...baseItem, paymentIntentId: "pi_test_2", amountRappen: 5000 },
    ]);
    expect(html).toContain("pi_test_1");
    expect(html).toContain("pi_test_2");
    expect(html).toContain("2 Stripe payments");
  });
});

describe("sendReconciliationReviewEmail", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("does nothing when there are no items", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await sendReconciliationReviewEmail([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY;
    process.env.ADMIN_EMAIL = "admin@example.com";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await sendReconciliationReviewEmail([{ ...baseItemFor("pi_1") }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing when ADMIN_EMAIL is unset", async () => {
    process.env.RESEND_API_KEY = "re_test";
    delete process.env.ADMIN_EMAIL;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await sendReconciliationReviewEmail([baseItemFor("pi_1")]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends to ADMIN_EMAIL when both env vars are set", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.ADMIN_EMAIL = "admin@example.com";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await sendReconciliationReviewEmail([baseItemFor("pi_1")]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.to).toBe("admin@example.com");
    expect(body.html).toContain("pi_1");
  });

  it("throws when the Resend API responds with an error", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.ADMIN_EMAIL = "admin@example.com";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 422, text: async () => "bad" }),
    );

    await expect(
      sendReconciliationReviewEmail([baseItemFor("pi_1")]),
    ).rejects.toThrow(/Resend API 422/);
  });

  function baseItemFor(paymentIntentId: string): ReconciliationReviewItem {
    return {
      paymentIntentId,
      amountRappen: 10000,
      currency: "chf",
      stripeCreatedAt: new Date("2026-02-01T10:00:00Z"),
      candidates: [{ id: 1, name: "Ring", nameEn: null, price: "100.00" }],
      token: "tok",
    };
  }
});
