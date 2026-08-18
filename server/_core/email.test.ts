import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildReceiptHtml,
  buildReconciliationReviewHtml,
  buildOwnerOrderNotificationHtml,
  escapeHtml,
  sendClaimLinkEmail,
  sendReconciliationReviewEmail,
  sendOwnerOrderEmail,
  type OrderReceiptOptions,
  type OwnerOrderNotificationOptions,
  type ReconciliationReviewItem,
  buildPosAttributionReviewHtml,
  sendPosAttributionReviewEmail,
  type PosAttributionReviewItem,
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

  it("renders the receipt in the order's locale (fr)", () => {
    const html = buildReceiptHtml({
      ...baseOpts,
      locale: "fr",
      items: [
        {
          id: 1,
          name: "Goldkette",
          nameEn: "Gold Necklace",
          nameFr: "Collier en or",
          nameIt: null,
          price: "120.00",
          imageUrl: null,
        },
      ],
    });
    expect(html).toContain("Quittance");
    expect(html).toContain("Facturé à");
    expect(html).toContain("Collier en or");
    expect(html).not.toContain("Gold Necklace");
    expect(html).toContain("1 janvier 2026");
  });

  it("renders German labels and falls back to the primary name when a translation is missing", () => {
    const html = buildReceiptHtml({ ...baseOpts, locale: "de" });
    expect(html).toContain("Quittung");
    expect(html).toContain("Rechnung an");
    // No nameDe on the item → primary (German-by-convention) name.
    expect(html).toContain("Goldkette");
  });

  it("renders Italian labels", () => {
    const html = buildReceiptHtml({ ...baseOpts, locale: "it" });
    expect(html).toContain("Ricevuta");
    expect(html).toContain("Totale");
  });

  it("defaults to English for missing or unknown locales", () => {
    for (const locale of [undefined, null, "rm", "xx"]) {
      const html = buildReceiptHtml({
        ...baseOpts,
        locale: locale as string | null | undefined,
      });
      expect(html).toContain("Receipt");
      expect(html).toContain("Gold Necklace");
    }
  });

  it("renders the branding's vertical-specific returns footer", () => {
    const jewellery = buildReceiptHtml({
      ...baseOpts,
      branding: { returnsFooter: "14-day returns on unworn, undamaged pieces" },
    });
    expect(jewellery).toContain("14-day returns on unworn, undamaged pieces");

    // No branding → the neutral default; "unworn" is jewellery-only wording.
    const neutral = buildReceiptHtml(baseOpts);
    expect(neutral).toContain(
      "14-day returns on unused items in original condition",
    );
    expect(neutral).not.toContain("unworn");
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

  // Items rebuilt from an existing reconciliation row carry the position the
  // confirm route indexes into, which is not the array position once a deleted
  // candidate has been dropped.
  it("uses a candidate's stored choiceIndex for its assign link", () => {
    const html = buildReconciliationReviewHtml([
      {
        ...baseItem,
        candidates: [
          {
            id: 9,
            name: "Anstecker",
            nameEn: "Pin",
            price: "98.00",
            choiceIndex: 2,
          },
        ],
      },
    ]);
    expect(html).toContain("/api/reconciliation/confirm?token=abc123&choice=2");
    expect(html).not.toContain("choice=0");
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
    expect(await sendReconciliationReviewEmail([])).toEqual({
      sent: false,
      reason: expect.any(String),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Reporting "nothing happened" as success is what let an unsent review email
  // pass for a delivered one — the caller has to be able to tell them apart.
  it("reports the missing key when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY;
    process.env.ADMIN_EMAIL = "admin@example.com";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendReconciliationReviewEmail([
      { ...baseItemFor("pi_1") },
    ]);
    expect(result).toEqual({
      sent: false,
      reason: expect.stringContaining("RESEND_API_KEY"),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports the missing recipient when ADMIN_EMAIL is unset", async () => {
    process.env.RESEND_API_KEY = "re_test";
    delete process.env.ADMIN_EMAIL;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendReconciliationReviewEmail([baseItemFor("pi_1")]);
    expect(result).toEqual({
      sent: false,
      reason: expect.stringContaining("recipient"),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends to ADMIN_EMAIL when both env vars are set", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.ADMIN_EMAIL = "admin@example.com";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    expect(await sendReconciliationReviewEmail([baseItemFor("pi_1")])).toEqual({
      sent: true,
    });

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

// Signup's durable claim link (tenant.create step 8) — the copy of the claim
// token that survives a lost signup tab.
describe("sendClaimLinkEmail", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("returns false without sending when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const sent = await sendClaimLinkEmail({
      to: "owner@aurora.example",
      url: "https://zolto.ch/onboarding?store=aurora&claim=tok",
      storeName: "Aurora Atelier",
    });
    expect(sent).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the link and escapes a hostile store name", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const sent = await sendClaimLinkEmail({
      to: "owner@aurora.example",
      url: "https://zolto.ch/onboarding?store=aurora&claim=tok",
      storeName: `<img src=x onerror=alert(1)>`,
    });

    expect(sent).toBe(true);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.to).toBe("owner@aurora.example");
    expect(body.html).toContain(
      "https://zolto.ch/onboarding?store=aurora&amp;claim=tok",
    );
    expect(body.html).not.toContain("<img");
    expect(body.html).toContain("&lt;img");
  });
});

describe("buildOwnerOrderNotificationHtml", () => {
  const baseOpts: OwnerOrderNotificationOptions = {
    to: "sheena@example.com",
    ownerName: "Sheena Arora",
    orderRef: 42,
    amountTotal: 18500,
    customerName: "Jane Buyer",
    customerEmail: "jane@example.com",
    paymentMethod: "card",
    items: [{ name: "Goldkette", nameEn: "Gold Necklace", price: "185.00" }],
  };

  it("greets the owner by name and includes the order total and items", () => {
    const html = buildOwnerOrderNotificationHtml(baseOpts);
    expect(html).toContain("Hi Sheena Arora");
    expect(html).toContain("#00042");
    expect(html).toContain("CHF 185.00");
    expect(html).toContain("Gold Necklace");
  });

  it("falls back to a generic greeting when the owner has no name yet (pending claim)", () => {
    const html = buildOwnerOrderNotificationHtml({
      ...baseOpts,
      ownerName: null,
    });
    expect(html).toContain("Hi there");
  });

  it("escapes a malicious owner name and customer name", () => {
    const html = buildOwnerOrderNotificationHtml({
      ...baseOpts,
      ownerName: `<img src=x onerror=alert(1)>`,
      customerName: `<script>alert(1)</script>`,
    });
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});

describe("sendOwnerOrderEmail", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  const baseOpts: OwnerOrderNotificationOptions = {
    to: "sheena@example.com",
    ownerName: "Sheena Arora",
    orderRef: 7,
    amountTotal: 5000,
    customerName: "Jane Buyer",
    customerEmail: "jane@example.com",
    paymentMethod: "card",
    items: [{ name: "Ring", nameEn: null, price: "50.00" }],
  };

  it("does nothing when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await sendOwnerOrderEmail(baseOpts);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing when there's no owner email to send to", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await sendOwnerOrderEmail({ ...baseOpts, to: "" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends to the owner's email with the order total in the subject", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await sendOwnerOrderEmail(baseOpts);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.to).toBe("sheena@example.com");
    expect(body.subject).toContain("CHF 50.00");
    expect(body.html).toContain("Ring");
  });

  it("throws when the Resend API responds with an error", async () => {
    process.env.RESEND_API_KEY = "re_test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "oops",
      }),
    );

    await expect(sendOwnerOrderEmail(baseOpts)).rejects.toThrow(
      /Resend API 500/,
    );
  });
});

// The in-person sibling of the reconciliation email: same one-click shape,
// pointing at /api/pos-attribution/confirm.
describe("POS attribution review email", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  function item(
    overrides: Partial<PosAttributionReviewItem> = {},
  ): PosAttributionReviewItem {
    return {
      posOrderItemId: 100,
      amountRappen: 5000,
      soldAt: new Date("2026-07-20T15:00:00Z"),
      itemLabel: "Custom",
      candidates: [{ id: 7, name: "Ring", nameEn: null, price: "50.00" }],
      token: "tok",
      ...overrides,
    };
  }

  it("includes a per-candidate confirm link carrying the token and choice index", () => {
    const html = buildPosAttributionReviewHtml([item()]);
    expect(html).toContain("/api/pos-attribution/confirm?token=tok&choice=0");
    expect(html).toContain(
      "/api/pos-attribution/confirm?token=tok&choice=none",
    );
  });

  // Items rebuilt from an existing attribution row carry the position the
  // confirm route indexes into, which is not the array position once a deleted
  // candidate has been dropped.
  it("uses a candidate's stored choiceIndex for its confirm link", () => {
    const html = buildPosAttributionReviewHtml([
      {
        ...item(),
        candidates: [
          {
            id: 9,
            name: "Anstecker",
            nameEn: "Pin",
            price: "50.00",
            choiceIndex: 2,
          },
        ],
      },
    ]);
    expect(html).toContain("/api/pos-attribution/confirm?token=tok&choice=2");
    expect(html).not.toContain("choice=0");
  });

  // Reporting "nothing happened" as success is what let an unsent review email
  // pass for a delivered one — the caller has to be able to tell them apart.
  it("reports the missing key when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY;
    process.env.ADMIN_EMAIL = "admin@example.com";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await sendPosAttributionReviewEmail([item()])).toEqual({
      sent: false,
      reason: expect.stringContaining("RESEND_API_KEY"),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports the missing recipient when no address is available", async () => {
    process.env.RESEND_API_KEY = "re_test";
    delete process.env.ADMIN_EMAIL;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await sendPosAttributionReviewEmail([item()])).toEqual({
      sent: false,
      reason: expect.stringContaining("recipient"),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends to the store's own admin when one is given", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.ADMIN_EMAIL = "platform@example.com";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    expect(
      await sendPosAttributionReviewEmail([item()], {
        to: "anna@bergblume.ch",
        tenantName: "Bergblume",
      }),
    ).toEqual({ sent: true });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.to).toBe("anna@bergblume.ch");
    expect(body.subject).toContain("Bergblume");
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

    await expect(sendPosAttributionReviewEmail([item()])).rejects.toThrow(
      /Resend API 422/,
    );
  });
});
