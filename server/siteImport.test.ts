import { describe, it, expect } from "vitest";
import {
  contactFromHtml,
  decodeEntities,
  extractPage,
  htmlToText,
  logoFromHtml,
  looksLikeCatalogueUrl,
  mergeExtractions,
  parseJsonLd,
  parseMetaTags,
  productFromMeta,
  productsFromJsonLd,
  profileFromJsonLd,
  sameOriginLinks,
  stockFromOffer,
  themeColorFromHtml,
} from "./siteImport";

const PAGE = "https://bergblume.example/products/mug";

function jsonLd(obj: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
}

describe("html scraping primitives", () => {
  it("decodes the entities that actually appear in shop copy", () => {
    expect(
      decodeEntities("Caf&eacute; &amp; Th&#233; &#x2014; 5&nbsp;dl"),
    ).toBe("Café & Thé — 5 dl");
  });

  it("turns a description block into readable text", () => {
    expect(
      htmlToText("<p>Hand-thrown.</p><p>Dishwasher <b>safe</b>.</p>"),
    ).toBe("Hand-thrown.\nDishwasher safe.");
  });

  it("drops script and style content rather than importing it as prose", () => {
    expect(
      htmlToText("<div>Real<script>var x=1</script><style>a{}</style></div>"),
    ).toBe("Real");
  });

  it("reads meta tags by both name and property", () => {
    const meta = parseMetaTags(
      `<meta property="og:title" content="Mug"><meta name="description" content="A mug">`,
    );
    expect(meta.get("og:title")).toBe("Mug");
    expect(meta.get("description")).toBe("A mug");
  });

  it("keeps only same-origin links, absolute and de-fragmented", () => {
    const links = sameOriginLinks(
      `<a href="/products/bowl#top">b</a><a href="https://other.example/x">x</a><a href="https://bergblume.example/about">a</a>`,
      PAGE,
    );
    expect(links).toContain("https://bergblume.example/products/bowl");
    expect(links).toContain("https://bergblume.example/about");
    expect(links.some((l) => l.includes("other.example"))).toBe(false);
  });

  it("recognises catalogue URLs across the languages we serve", () => {
    for (const u of [
      "https://x.test/products/mug",
      "https://x.test/shop",
      "https://x.test/collections/winter",
      "https://x.test/produkte/tasse",
      "https://x.test/boutique/tasse",
      "https://x.test/prodotti/tazza",
    ]) {
      expect(looksLikeCatalogueUrl(u), u).toBe(true);
    }
    expect(looksLikeCatalogueUrl("https://x.test/impressum")).toBe(false);
  });
});

describe("JSON-LD parsing", () => {
  it("flattens @graph envelopes and arrays", () => {
    const nodes = parseJsonLd(
      jsonLd({ "@graph": [{ "@type": "Product", name: "A" }] }) +
        jsonLd([{ "@type": "Product", name: "B" }]),
    );
    expect(nodes).toHaveLength(2);
  });

  it("repairs a trailing comma rather than losing the whole catalogue", () => {
    // Real CMS output does this; one cheap repair pass is worth a whole shop.
    const nodes = parseJsonLd(
      `<script type="application/ld+json">{"@type":"Product","name":"Mug",}</script>`,
    );
    expect(nodes).toHaveLength(1);
  });

  it("skips a block that is beyond repair instead of throwing", () => {
    expect(
      parseJsonLd(
        `<script type="application/ld+json">not json at all {{</script>`,
      ),
    ).toEqual([]);
  });
});

describe("products from JSON-LD", () => {
  it("reads name, price, currency, stock, image and category", () => {
    const [p] = productsFromJsonLd(
      parseJsonLd(
        jsonLd({
          "@type": "Product",
          name: "Stoneware Mug",
          description: "<p>Hand-thrown</p>",
          category: "Mugs & Cups",
          image: "/img/mug.jpg",
          offers: {
            "@type": "Offer",
            price: "42.00",
            priceCurrency: "chf",
            availability: "https://schema.org/InStock",
            inventoryLevel: 7,
          },
        }),
      ),
      PAGE,
    );
    expect(p).toMatchObject({
      name: "Stoneware Mug",
      description: "Hand-thrown",
      price: 42,
      currency: "CHF",
      quantity: 7,
      imageUrl: "https://bergblume.example/img/mug.jpg",
      rawCategory: "Mugs & Cups",
    });
  });

  it("parses the Swiss money formats a shop actually writes", () => {
    // Reuses parseSwissAmount from providerMigration so both importers read
    // "CHF 1'234.50" and "25.–" the same way.
    const nodes = parseJsonLd(
      jsonLd({
        "@type": "Product",
        name: "Vase",
        offers: { price: "CHF 1'234.50" },
      }),
    );
    expect(productsFromJsonLd(nodes, PAGE)[0].price).toBe(1234.5);
  });

  it("unwraps an AggregateOffer to reach the real price", () => {
    const nodes = parseJsonLd(
      jsonLd({
        "@type": "Product",
        name: "Bowl",
        offers: {
          "@type": "AggregateOffer",
          offers: [{ "@type": "Offer", price: "30", priceCurrency: "CHF" }],
        },
      }),
    );
    expect(productsFromJsonLd(nodes, PAGE)[0]).toMatchObject({ price: 30 });
  });

  it("keeps a product whose price is unreadable, with price null", () => {
    // Losing the item entirely would be worse: the merchant can type a price,
    // but can't retype a product they were never shown.
    const nodes = parseJsonLd(
      jsonLd({
        "@type": "Product",
        name: "Plate",
        offers: { price: "ask us" },
      }),
    );
    expect(productsFromJsonLd(nodes, PAGE)[0]).toMatchObject({
      name: "Plate",
      price: null,
    });
  });

  it("ignores non-Product nodes and unnamed products", () => {
    const nodes = parseJsonLd(
      jsonLd([
        { "@type": "Article", name: "Blog post" },
        { "@type": "Product", description: "no name" },
      ]),
    );
    expect(productsFromJsonLd(nodes, PAGE)).toEqual([]);
  });

  it("accepts a node typed as both Product and something else", () => {
    const nodes = parseJsonLd(
      jsonLd({ "@type": ["Product", "IndividualProduct"], name: "Ring" }),
    );
    expect(productsFromJsonLd(nodes, PAGE)).toHaveLength(1);
  });
});

describe("stock from an offer", () => {
  it("prefers an exact inventory level", () => {
    expect(stockFromOffer({ inventoryLevel: 12 })).toBe(12);
    expect(stockFromOffer({ inventoryLevel: { "@value": "3" } })).toBe(3);
  });

  it("reads sold out as zero, in stock as one", () => {
    expect(
      stockFromOffer({ availability: "https://schema.org/OutOfStock" }),
    ).toBe(0);
    expect(stockFromOffer({ availability: "http://schema.org/SoldOut" })).toBe(
      0,
    );
    expect(stockFromOffer({ availability: "https://schema.org/InStock" })).toBe(
      1,
    );
  });

  it("defaults an unstated stock to one, not to a made-up number", () => {
    // 1 lets the first sale happen; a fabricated 999 would be a lie in the
    // merchant's inventory on day one.
    expect(stockFromOffer({})).toBe(1);
  });

  it("honours a genuine zero inventory level", () => {
    expect(stockFromOffer({ inventoryLevel: 0, availability: "InStock" })).toBe(
      0,
    );
  });
});

describe("OpenGraph fallback", () => {
  const meta = (html: string) => parseMetaTags(html);

  it("reads a product page that has no JSON-LD", () => {
    const p = productFromMeta(
      meta(
        `<meta property="og:type" content="product">
         <meta property="og:title" content="Linen Apron">
         <meta property="og:description" content="Stonewashed">
         <meta property="product:price:amount" content="89.00">
         <meta property="product:price:currency" content="chf">
         <meta property="og:image" content="/a.jpg">`,
      ),
      PAGE,
    );
    expect(p).toMatchObject({
      name: "Linen Apron",
      price: 89,
      currency: "CHF",
      imageUrl: "https://bergblume.example/a.jpg",
    });
  });

  it("refuses to turn an About page into a product", () => {
    // Without this guard every page on the site imports as a priceless item.
    expect(
      productFromMeta(
        meta(
          `<meta property="og:type" content="website"><meta property="og:title" content="About us">`,
        ),
        PAGE,
      ),
    ).toBeNull();
  });

  it("accepts a page that states a price even without og:type", () => {
    expect(
      productFromMeta(
        meta(
          `<meta property="og:title" content="Mug"><meta property="product:price:amount" content="20">`,
        ),
        PAGE,
      ),
    ).toMatchObject({ name: "Mug", price: 20 });
  });

  it("reads sold-out availability", () => {
    expect(
      productFromMeta(
        meta(
          `<meta property="og:type" content="product"><meta property="og:title" content="X"><meta property="product:availability" content="out of stock">`,
        ),
        PAGE,
      ),
    ).toMatchObject({ quantity: 0 });
  });
});

describe("shop profile", () => {
  it("reads a LocalBusiness block", () => {
    const profile = profileFromJsonLd(
      parseJsonLd(
        jsonLd({
          "@type": "LocalBusiness",
          name: "Bergblume Keramik",
          description: "Wheel-thrown stoneware",
          email: "mailto:hello@bergblume.example",
          telephone: "+41 79 000 00 00",
          logo: "/logo.png",
          address: {
            streetAddress: "Dorfstrasse 1",
            postalCode: "3000",
            addressLocality: "Bern",
          },
          openingHours: ["Mo-Fr 09:00-18:00", "Sa 09:00-16:00"],
        }),
      ),
      PAGE,
    );
    expect(profile).toMatchObject({
      storeName: "Bergblume Keramik",
      about: "Wheel-thrown stoneware",
      email: "hello@bergblume.example",
      phone: "+41 79 000 00 00",
      logoUrl: "https://bergblume.example/logo.png",
      addressLine: "Dorfstrasse 1",
      postalCode: "3000",
      city: "Bern",
      openingHours: "Mo-Fr 09:00-18:00; Sa 09:00-16:00",
    });
  });

  it("finds contact details from mailto/tel links when there is no JSON-LD", () => {
    expect(
      contactFromHtml(
        `<a href="mailto:Hello@Shop.example?subject=hi">mail</a><a href="tel:+41 44 000 00 00">call</a>`,
      ),
    ).toEqual({ email: "hello@shop.example", phone: "+41 44 000 00 00" });
  });

  it("prefers a declared icon over the social preview image for the logo", () => {
    const html = `<link rel="apple-touch-icon" href="/icon.png">`;
    expect(
      logoFromHtml(
        html,
        parseMetaTags(`<meta property="og:image" content="/og.jpg">`),
        PAGE,
      ),
    ).toBe("https://bergblume.example/icon.png");
  });
});

describe("brand colour", () => {
  it("reads the declared theme colour", () => {
    expect(
      themeColorFromHtml(
        parseMetaTags(`<meta name="theme-color" content="#1B7F5A">`),
      ),
    ).toBe("#1b7f5a");
  });

  it("expands the three-digit form, because tenant_settings stores six", () => {
    expect(
      themeColorFromHtml(
        parseMetaTags(`<meta name="theme-color" content="#0af">`),
      ),
    ).toBe("#00aaff");
  });

  it("falls back to the Microsoft tile colour", () => {
    expect(
      themeColorFromHtml(
        parseMetaTags(
          `<meta name="msapplication-TileColor" content="#123456">`,
        ),
      ),
    ).toBe("#123456");
  });

  it("returns nothing for a named or malformed colour rather than guessing", () => {
    // A merchant's storefront gets repainted from this value. "Nothing found"
    // has to mean nothing changes, not a colour we invented.
    expect(
      themeColorFromHtml(
        parseMetaTags(`<meta name="theme-color" content="rebeccapurple">`),
      ),
    ).toBeUndefined();
    expect(
      themeColorFromHtml(
        parseMetaTags(`<meta name="theme-color" content="#12345">`),
      ),
    ).toBeUndefined();
    expect(themeColorFromHtml(new Map())).toBeUndefined();
  });

  it("rides along on the page extraction", () => {
    const page = extractPage(
      `<meta name="theme-color" content="#883333">`,
      PAGE,
    );
    expect(page.profile.primaryColor).toBe("#883333");
  });
});

describe("extractPage", () => {
  it("does not double-count a product present in both JSON-LD and meta", () => {
    const page = extractPage(
      jsonLd({ "@type": "Product", name: "Mug", offers: { price: "20" } }) +
        `<meta property="og:type" content="product"><meta property="og:title" content="Mug"><meta property="product:price:amount" content="20">`,
      PAGE,
    );
    expect(page.products).toHaveLength(1);
  });

  it("takes categories from breadcrumbs, minus the Home crumb", () => {
    const page = extractPage(
      jsonLd({
        "@type": "BreadcrumbList",
        itemListElement: [
          { name: "Home" },
          { name: "Tableware" },
          { name: "Stoneware Mug" },
        ],
      }),
      PAGE,
    );
    expect(page.categories).toContain("Tableware");
    expect(page.categories).not.toContain("Home");
  });
});

describe("mergeExtractions", () => {
  const page = (products: unknown[]): never =>
    ({
      products,
      profile: {},
      categories: [],
      links: [],
    }) as never;

  it("dedupes the same product seen on a listing and its own page", () => {
    const merged = mergeExtractions([
      page([
        {
          name: "Mug",
          description: "short",
          price: null,
          quantity: 1,
          rawCategory: "",
          sourceUrl: "a",
        },
      ]),
      page([
        {
          name: "mug",
          description: "a much longer description",
          price: 42,
          quantity: 1,
          rawCategory: "Tableware",
          sourceUrl: "b",
        },
      ]),
    ]);

    expect(merged.products).toHaveLength(1);
    // Richer data wins on every field independently.
    expect(merged.products[0]).toMatchObject({
      price: 42,
      description: "a much longer description",
      rawCategory: "Tableware",
    });
  });

  it("lets a sold-out reading win over an assumed in-stock", () => {
    const merged = mergeExtractions([
      page([
        {
          name: "X",
          description: "",
          price: 1,
          quantity: 1,
          rawCategory: "",
          sourceUrl: "a",
        },
      ]),
      page([
        {
          name: "X",
          description: "",
          price: 1,
          quantity: 0,
          rawCategory: "",
          sourceUrl: "b",
        },
      ]),
    ]);
    expect(merged.products[0].quantity).toBe(0);
  });

  it("says plainly when a site yielded nothing readable", () => {
    // SITE_IMPORT.caveat promises this, and it is what makes charging after
    // the preview honest.
    const merged = mergeExtractions([page([])]);
    expect(merged.products).toEqual([]);
    expect(merged.warnings.join(" ")).toMatch(/couldn't find any products/i);
  });

  it("counts what is missing so the merchant can judge before paying", () => {
    const merged = mergeExtractions([
      page([
        {
          name: "A",
          description: "",
          price: null,
          quantity: 1,
          rawCategory: "",
          sourceUrl: "a",
        },
        {
          name: "B",
          description: "",
          price: 5,
          quantity: 1,
          rawCategory: "",
          sourceUrl: "b",
        },
      ]),
    ]);
    expect(merged.warnings.join(" ")).toMatch(/1 of 2 products had no price/);
    expect(merged.warnings.join(" ")).toMatch(
      /2 products came without a photo/,
    );
  });
});
