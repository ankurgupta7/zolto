import { describe, expect, it } from "vitest";
import {
  type ProductSeo,
  type StorefrontIdentity,
  isInStock,
  productJsonLd,
  storeJsonLd,
  websiteJsonLd,
  breadcrumbJsonLd,
  shopCollectionJsonLd,
  renderStorefrontSitemapXml,
  storefrontProductUrl,
  STOREFRONT_NOINDEX_PATHS,
} from "./storefront";

const identity: StorefrontIdentity = {
  storeName: "Aurora Atelier",
  baseUrl: "https://aurora.zolto.shop",
  currency: "chf",
  description: "Handmade pieces from Zurich.",
  logoUrl: "https://cdn.test/logo.png",
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

describe("isInStock", () => {
  it("requires both not-sold and positive quantity", () => {
    expect(isInStock({ sold: false, quantity: 1 })).toBe(true);
    expect(isInStock({ sold: true, quantity: 1 })).toBe(false);
    expect(isInStock({ sold: false, quantity: 0 })).toBe(false);
  });
});

describe("productJsonLd", () => {
  it("emits a Product with a priced Offer in the store's currency", () => {
    const node = productJsonLd(product(), identity) as Record<string, any>;
    expect(node["@type"]).toBe("Product");
    expect(node.name).toBe("Pearl Drop Earrings");
    expect(node.sku).toBe("SKU-7");
    expect(node.brand).toEqual({ "@type": "Brand", name: "Aurora Atelier" });
    expect(node.offers.priceCurrency).toBe("CHF");
    expect(node.offers.price).toBe("89.00");
    expect(node.offers.url).toBe("https://aurora.zolto.shop/product/7");
  });

  it("marks sold-out stock as OutOfStock", () => {
    const live = productJsonLd(product(), identity) as Record<string, any>;
    expect(live.offers.availability).toBe("https://schema.org/InStock");

    const gone = productJsonLd(product({ sold: true }), identity) as Record<
      string,
      any
    >;
    expect(gone.offers.availability).toBe("https://schema.org/OutOfStock");

    const empty = productJsonLd(product({ quantity: 0 }), identity) as Record<
      string,
      any
    >;
    expect(empty.offers.availability).toBe("https://schema.org/OutOfStock");
  });

  it("normalizes numeric prices to two decimals", () => {
    const node = productJsonLd(product({ price: 12.5 }), identity) as Record<
      string,
      any
    >;
    expect(node.offers.price).toBe("12.50");
  });

  it("omits image when the product has none", () => {
    const node = productJsonLd(product({ images: [] }), identity) as Record<
      string,
      any
    >;
    expect(node.image).toBeUndefined();
  });

  it("makes no shipping claim (rates are destination-dependent)", () => {
    const node = productJsonLd(product(), identity) as Record<string, any>;
    expect(node.offers.shippingDetails).toBeUndefined();
  });

  it("points the seller at the store node rather than duplicating it", () => {
    const node = productJsonLd(product(), identity) as Record<string, any>;
    expect(node.offers.seller).toEqual({
      "@id": "https://aurora.zolto.shop/#store",
    });
  });
});

describe("storeJsonLd / websiteJsonLd", () => {
  it("emits a Store with a stable @id other nodes can reference", () => {
    const node = storeJsonLd(identity) as Record<string, any>;
    expect(node["@type"]).toBe("Store");
    expect(node["@id"]).toBe("https://aurora.zolto.shop/#store");
    expect(node.name).toBe("Aurora Atelier");
    expect(node.currenciesAccepted).toBe("CHF");
    expect(node.logo.url).toBe("https://cdn.test/logo.png");
  });

  it("omits optional fields that aren't set", () => {
    const node = storeJsonLd({
      storeName: "Bare",
      baseUrl: "https://bare.zolto.shop",
      currency: "eur",
    }) as Record<string, any>;
    expect(node.description).toBeUndefined();
    expect(node.logo).toBeUndefined();
    expect(node.currenciesAccepted).toBe("EUR");
  });

  it("links the website to its store publisher", () => {
    const node = websiteJsonLd(identity) as Record<string, any>;
    expect(node.publisher).toEqual({
      "@id": "https://aurora.zolto.shop/#store",
    });
  });
});

describe("breadcrumbJsonLd", () => {
  it("numbers positions from 1 and absolutizes paths", () => {
    const node = breadcrumbJsonLd(identity.baseUrl, [
      ["Home", "/"],
      ["Shop", "/shop"],
    ]) as Record<string, any>;
    expect(node.itemListElement[0].position).toBe(1);
    expect(node.itemListElement[1].item).toBe("https://aurora.zolto.shop/shop");
  });
});

describe("shopCollectionJsonLd", () => {
  it("lists only in-stock items and counts them", () => {
    const node = shopCollectionJsonLd(
      [product({ id: 1 }), product({ id: 2, sold: true }), product({ id: 3 })],
      identity,
    ) as Record<string, any>;
    expect(node.mainEntity.numberOfItems).toBe(2);
    expect(node.mainEntity.itemListElement).toHaveLength(2);
    expect(node.mainEntity.itemListElement[0].url).toBe(
      "https://aurora.zolto.shop/product/1",
    );
  });

  it("caps the enumerated list at 50 entries", () => {
    const many = Array.from({ length: 80 }, (_, i) => product({ id: i + 1 }));
    const node = shopCollectionJsonLd(many, identity) as Record<string, any>;
    expect(node.mainEntity.numberOfItems).toBe(80);
    expect(node.mainEntity.itemListElement).toHaveLength(50);
  });
});

describe("renderStorefrontSitemapXml", () => {
  it("lists the storefront's own static routes, not marketing ones", () => {
    const xml = renderStorefrontSitemapXml(identity.baseUrl, []);
    expect(xml).toContain("<loc>https://aurora.zolto.shop/</loc>");
    expect(xml).toContain("<loc>https://aurora.zolto.shop/shop</loc>");
    // The bug this fixes: storefronts used to serve the marketing sitemap.
    expect(xml).not.toContain("/pricing");
    expect(xml).not.toContain("/blog");
    expect(xml).not.toContain("/signup");
  });

  it("includes a URL per in-stock product and omits sold ones", () => {
    const xml = renderStorefrontSitemapXml(identity.baseUrl, [
      product({ id: 11 }),
      product({ id: 12, sold: true }),
    ]);
    expect(xml).toContain("<loc>https://aurora.zolto.shop/product/11</loc>");
    expect(xml).not.toContain("/product/12");
  });

  it("uses the product's updatedAt for lastmod when present", () => {
    const xml = renderStorefrontSitemapXml(identity.baseUrl, [
      { ...product({ id: 5 }), updatedAt: new Date("2026-03-04T10:00:00Z") },
    ]);
    expect(xml).toContain("<lastmod>2026-03-04</lastmod>");
  });

  it("is well-formed XML with a urlset root", () => {
    const xml = renderStorefrontSitemapXml(identity.baseUrl, [product()]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain("<urlset");
    expect(xml.trimEnd().endsWith("</urlset>")).toBe(true);
  });

  it("tolerates a base URL with a trailing slash", () => {
    const xml = renderStorefrontSitemapXml("https://aurora.zolto.shop/", []);
    expect(xml).not.toContain("//shop");
  });
});

describe("storefrontProductUrl", () => {
  it("builds an absolute product URL", () => {
    expect(storefrontProductUrl("https://x.test/", 4)).toBe(
      "https://x.test/product/4",
    );
  });
});

describe("STOREFRONT_NOINDEX_PATHS", () => {
  it("keeps checkout and admin funnels out of the index", () => {
    expect(STOREFRONT_NOINDEX_PATHS).toContain("/checkout");
    expect(STOREFRONT_NOINDEX_PATHS).toContain("/admin");
  });
});
