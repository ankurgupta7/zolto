import { describe, expect, it } from "vitest";
import {
  getStorefrontSeo,
  injectStorefrontSeo,
  parseProductPath,
  toProductSeo,
  type StorefrontSeoData,
} from "./storefrontSeo";
import type { ProductSeo, StorefrontIdentity } from "@shared/storefront";

const identity: StorefrontIdentity = {
  storeName: "Aurora Atelier",
  baseUrl: "https://aurora.zolto.ch",
  currency: "chf",
  description: "Handmade pieces from Zurich.",
  logoUrl: null,
};

function product(over: Partial<ProductSeo> = {}): ProductSeo {
  return {
    id: 7,
    name: "Pearl Drop Earrings",
    description: "Freshwater pearls on gold-filled hooks.",
    price: "89.00",
    category: "Earrings",
    images: ["https://cdn.test/7.jpg"],
    sold: false,
    quantity: 3,
    ...over,
  };
}

function data(over: Partial<StorefrontSeoData> = {}): StorefrontSeoData {
  return { identity, products: [], ...over };
}

/** A stand-in for the built index.html shell. */
const SHELL = `<!doctype html><html><head><title>Zolto</title>
<meta name="description" content="default" />
<meta property="og:title" content="Zolto" />
<meta property="og:description" content="default" />
<meta property="twitter:title" content="Zolto" />
<meta property="twitter:description" content="default" />
</head><body><div id="root"></div></body></html>`;

describe("parseProductPath", () => {
  it("extracts a positive integer id", () => {
    expect(parseProductPath("/product/12")).toBe(12);
  });

  it("rejects non-product and malformed paths", () => {
    expect(parseProductPath("/shop")).toBeNull();
    expect(parseProductPath("/product/")).toBeNull();
    expect(parseProductPath("/product/abc")).toBeNull();
    expect(parseProductPath("/product/0")).toBeNull();
    expect(parseProductPath("/product/1/edit")).toBeNull();
    expect(parseProductPath("/product/-3")).toBeNull();
  });
});

describe("toProductSeo", () => {
  it("prefers the English name/description for AI consumers", () => {
    const seo = toProductSeo({
      id: 1,
      name: "Perlenohrringe",
      nameEn: "Pearl Earrings",
      description: "Süßwasserperlen",
      descriptionEn: "Freshwater pearls",
      price: "42.00",
      category: "Earrings",
      imageUrl: "https://cdn.test/1.jpg",
      sold: false,
      quantity: 2,
    });
    expect(seo.name).toBe("Pearl Earrings");
    expect(seo.description).toBe("Freshwater pearls");
  });

  it("falls back to the merchant's primary locale when untranslated", () => {
    const seo = toProductSeo({
      id: 1,
      name: "Perlenohrringe",
      nameEn: "   ",
      description: "Süßwasserperlen",
      descriptionEn: null,
      price: "42.00",
      category: "Earrings",
      imageUrl: null,
      sold: false,
      quantity: 2,
    });
    expect(seo.name).toBe("Perlenohrringe");
    expect(seo.description).toBe("Süßwasserperlen");
    expect(seo.images).toEqual([]);
  });
});

describe("getStorefrontSeo — product pages", () => {
  it("builds Product JSON-LD and a priced title for a resolved product", () => {
    const seo = getStorefrontSeo("/product/7", data({ product: product() }));
    expect(seo).not.toBeNull();
    expect(seo!.title).toBe("Pearl Drop Earrings — Aurora Atelier");
    expect(seo!.path).toBe("/product/7");
    const types = seo!.jsonLd.map((n) => n["@type"]);
    expect(types).toContain("Product");
    expect(types).toContain("Store");
    expect(types).toContain("BreadcrumbList");
    expect(seo!.noscript).toContain("CHF 89.00");
    expect(seo!.noscript).toContain("Available");
  });

  it("reports sold pieces as sold in the crawler-facing copy", () => {
    const seo = getStorefrontSeo(
      "/product/7",
      data({ product: product({ sold: true }) }),
    );
    expect(seo!.noscript).toContain("Sold");
  });

  it("returns null when the product does not resolve", () => {
    expect(getStorefrontSeo("/product/7", data({ product: null }))).toBeNull();
  });

  it("returns null when the resolved product is a different id", () => {
    expect(
      getStorefrontSeo("/product/7", data({ product: product({ id: 9 }) })),
    ).toBeNull();
  });

  it("caps the meta description length", () => {
    const seo = getStorefrontSeo(
      "/product/7",
      data({ product: product({ description: "x".repeat(900) }) }),
    );
    expect(seo!.description.length).toBeLessThanOrEqual(300);
  });
});

describe("getStorefrontSeo — store pages", () => {
  it("gives the homepage a Store identity and a category summary", () => {
    const seo = getStorefrontSeo(
      "/",
      data({ products: [product(), product({ id: 8, category: "Rings" })] }),
    );
    expect(seo!.title).toBe("Aurora Atelier");
    // The Organization is Zolto's own node, which WebSite.creator points at —
    // the machine-readable "Made with Zolto" credit (shared/attribution.ts).
    expect(seo!.jsonLd.map((n) => n["@type"])).toEqual([
      "Store",
      "WebSite",
      "Organization",
    ]);
    expect(seo!.noscript).toContain("Earrings (1)");
    expect(seo!.noscript).toContain("Rings (1)");
  });

  it("falls back to a generated homepage description without settings copy", () => {
    const seo = getStorefrontSeo("/", {
      identity: { ...identity, description: null },
      products: [product()],
    });
    expect(seo!.description).toContain("Aurora Atelier");
    expect(seo!.description).toContain("1 item(s)");
  });

  it("lists in-stock items with prices on the shop page", () => {
    const seo = getStorefrontSeo(
      "/shop",
      data({ products: [product(), product({ id: 8, sold: true })] }),
    );
    expect(seo!.title).toBe("Shop — Aurora Atelier");
    expect(seo!.jsonLd.map((n) => n["@type"])).toContain("CollectionPage");
    expect(seo!.noscript).toContain("Pearl Drop Earrings: CHF 89.00");
  });

  it("says so plainly when the shop is empty", () => {
    const seo = getStorefrontSeo("/shop", data({ products: [] }));
    expect(seo!.noscript).toContain("no items in stock");
  });

  it("covers about, contact and faq", () => {
    for (const [path, type] of [
      ["/about", "AboutPage"],
      ["/contact", "ContactPage"],
    ] as const) {
      const seo = getStorefrontSeo(path, data());
      expect(seo!.jsonLd.map((n) => n["@type"])).toContain(type);
    }
    expect(getStorefrontSeo("/faq", data())!.title).toBe(
      "FAQ — Aurora Atelier",
    );
  });

  it("normalizes trailing slashes and query strings", () => {
    expect(getStorefrontSeo("/shop/", data())!.path).toBe("/shop");
    expect(getStorefrontSeo("/shop?sort=new", data())!.path).toBe("/shop");
  });

  it("returns null for checkout, admin and unknown routes", () => {
    expect(getStorefrontSeo("/checkout", data())).toBeNull();
    expect(getStorefrontSeo("/admin/products", data())).toBeNull();
    expect(getStorefrontSeo("/nope", data())).toBeNull();
  });
});

describe("injectStorefrontSeo", () => {
  it("rewrites title, description and OG tags", () => {
    const out = injectStorefrontSeo(
      SHELL,
      "/product/7",
      data({ product: product() }),
    );
    expect(out).toContain(
      "<title>Pearl Drop Earrings — Aurora Atelier</title>",
    );
    expect(out).toContain(
      '<meta property="og:title" content="Pearl Drop Earrings — Aurora Atelier"',
    );
    expect(out).not.toContain('content="default"');
  });

  it("injects a canonical URL and JSON-LD before </head>", () => {
    const out = injectStorefrontSeo(
      SHELL,
      "/product/7",
      data({ product: product() }),
    );
    expect(out).toContain(
      '<link rel="canonical" href="https://aurora.zolto.ch/product/7" />',
    );
    expect(out).toContain('<script type="application/ld+json">');
    expect(out).toContain('"@type":"Product"');
    expect(out.indexOf("application/ld+json")).toBeLessThan(
      out.indexOf("</head>"),
    );
  });

  it("emits crawler-readable content in a noscript block", () => {
    const out = injectStorefrontSeo(
      SHELL,
      "/product/7",
      data({ product: product() }),
    );
    expect(out).toContain("<noscript>");
    expect(out).toContain("Freshwater pearls on gold-filled hooks.");
  });

  it("leaves non-public routes untouched", () => {
    expect(injectStorefrontSeo(SHELL, "/checkout", data())).toBe(SHELL);
  });

  it("escapes tenant-controlled text so a store name can't inject markup", () => {
    const out = injectStorefrontSeo(SHELL, "/", {
      identity: { ...identity, storeName: '<script>alert("x")</script>' },
      products: [],
    });
    expect(out).not.toContain("<title><script>alert");
    expect(out).toContain("&lt;script&gt;");
  });

  it("produces valid JSON in every ld+json block", () => {
    const out = injectStorefrontSeo(
      SHELL,
      "/shop",
      data({ products: [product()] }),
    );
    const blocks = [
      ...out.matchAll(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
      ),
    ];
    expect(blocks.length).toBeGreaterThan(0);
    for (const [, json] of blocks) {
      const parsed = JSON.parse(json);
      expect(parsed["@context"]).toBe("https://schema.org");
    }
  });
});

describe("the Made with Zolto credit in storefront SEO", () => {
  /** Every JSON-LD node the injected HTML carries, flattened out of @graph. */
  function nodes(html: string): Record<string, unknown>[] {
    return [
      ...html.matchAll(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
      ),
    ].flatMap(([, json]) => {
      const parsed = JSON.parse(json);
      return (parsed["@graph"] ?? [parsed]) as Record<string, unknown>[];
    });
  }

  it("points the WebSite at a Zolto Organization node that is actually present", () => {
    // A dangling `creator` reference would be worse than no credit: a consumer
    // resolving the @id would find nothing.
    const graph = nodes(injectStorefrontSeo(SHELL, "/", data()));
    const website = graph.find((n) => n["@type"] === "WebSite")!;
    const creator = website.creator as { "@id": string };
    expect(creator["@id"]).toBe("https://zolto.ch/#organization");
    const org = graph.find((n) => n["@id"] === creator["@id"]);
    expect(org).toMatchObject({ "@type": "Organization", name: "Zolto" });
  });

  it("keeps the store, not Zolto, as the publisher and the seller", () => {
    // The credit says who BUILT the site. Getting this backwards would tell a
    // shopping agent that Zolto is the counterparty for the order.
    const graph = nodes(
      injectStorefrontSeo(SHELL, "/product/7", data({ product: product() })),
    );
    const website = graph.find((n) => n["@type"] === "WebSite")!;
    expect(website.publisher).toEqual({
      "@id": "https://aurora.zolto.ch/#store",
    });
    const prod = graph.find((n) => n["@type"] === "Product")!;
    expect((prod.offers as { seller: unknown }).seller).toEqual({
      "@id": "https://aurora.zolto.ch/#store",
    });
  });

  it("gives a non-JS crawler the credit as a real, followable link", () => {
    // The whole point: AI crawlers don't run our React footer.
    const out = injectStorefrontSeo(SHELL, "/", data());
    const noscript = out.slice(out.indexOf("<noscript>"));
    expect(noscript).toContain("Aurora Atelier is made with Zolto");
    expect(noscript).toContain('<a href="https://zolto.ch/">');
  });

  it("names Zolto nowhere once a white-labelled store switches it off", () => {
    const white = { ...identity, attribution: false };
    for (const path of ["/", "/shop", "/about"]) {
      const out = injectStorefrontSeo(SHELL, path, {
        identity: white,
        products: [product()],
      });
      const injected = out.slice(out.indexOf("<title>"));
      expect(injected, path).not.toContain("zolto.ch/#organization");
      expect(injected, path).not.toContain("creator");
      expect(injected, path).not.toContain("made with Zolto");
    }
  });

  it("keeps the rest of the SEO intact for a white-labelled store", () => {
    const out = injectStorefrontSeo(SHELL, "/shop", {
      identity: { ...identity, attribution: false },
      products: [product()],
    });
    expect(out).toContain("<title>Shop — Aurora Atelier</title>");
    expect(nodes(out).map((n) => n["@type"])).toContain("CollectionPage");
  });
});
