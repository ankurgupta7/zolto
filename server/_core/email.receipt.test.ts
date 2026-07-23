import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { buildReceiptHtml, sendOrderReceipt } from "./email";

function baseOpts() {
  return {
    to: "buyer@example.com",
    customerName: null,
    orderRef: 42,
    amountTotal: 18500,
    items: [
      {
        id: 1,
        name: "Mondstein-Ring",
        nameEn: null,
        price: "185.00",
        imageUrl: null,
      },
    ],
  };
}

describe("buildReceiptHtml branches", () => {
  it("renders a thumbnail, shipping, payment, and billed-to when present", () => {
    const html = buildReceiptHtml({
      ...baseOpts(),
      customerName: "Jane Doe",
      paymentMethod: "twint",
      amountTotal: 19500, // 185.00 items + 10.00 shipping
      items: [
        {
          id: 1,
          name: "Mondstein-Ring",
          nameEn: "Moonstone Ring",
          price: "185.00",
          imageUrl: "/uploads/a.jpg",
        },
      ],
      branding: { tenantDomain: "https://aurora.example" },
    });

    expect(html).toContain("Moonstone Ring"); // nameEn used for the label
    expect(html).toContain("https://aurora.example/uploads/a.jpg"); // relative img resolved
    expect(html).toContain("Shipping");
    expect(html).toContain("TWINT".toLowerCase()); // payment method rendered
    expect(html).toContain("Billed to");
    expect(html).toContain("Jane Doe");
  });

  it("keeps an absolute image URL and omits optional rows when absent", () => {
    const html = buildReceiptHtml({
      ...baseOpts(),
      items: [
        {
          id: 2,
          name: "Ring",
          nameEn: null,
          price: "185.00",
          imageUrl: "https://cdn.example/x.jpg",
        },
      ],
    });
    expect(html).toContain("https://cdn.example/x.jpg");
    expect(html).not.toContain("Billed to");
    expect(html).not.toContain("Shipping");
  });
});

describe("sendOrderReceipt", () => {
  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
  });

  it("is a no-op when RESEND_API_KEY is unset", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await sendOrderReceipt(baseOpts());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts the receipt to Resend with a derived from-address", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const fetchSpy = vi.fn(async () => ({ ok: true, text: async () => "" }));
    vi.stubGlobal("fetch", fetchSpy);

    await sendOrderReceipt({
      ...baseOpts(),
      branding: {
        tenantName: "Aurora",
        tenantDomain: "https://aurora.example",
        contactEmail: "hi@aurora.example",
      },
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.from).toBe("hi@aurora.example");
    expect(body.subject).toContain("#00042");
    expect(body.to).toBe("buyer@example.com");
  });

  it("throws when Resend returns an error", async () => {
    process.env.RESEND_API_KEY = "re_test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 422,
        text: async () => "bad address",
      })),
    );
    await expect(sendOrderReceipt(baseOpts())).rejects.toThrow(
      /Resend API 422/,
    );
  });
});
