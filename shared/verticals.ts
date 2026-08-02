/**
 * Merchant verticals: what kind of store a tenant runs.
 *
 * Zolto supports merchants whose listed item IS the item sold, as-is — one
 * listing, one physical thing (jewellery, ceramics, art, vintage finds).
 * Variant-based goods (e.g. clothing sizes) are deliberately unsupported.
 *
 * Each vertical ships a preset: a curated starter category list (seeded into
 * `tenant_categories` at signup, then freely editable per tenant) plus the
 * vocabulary the AI prompts and customer-facing copy need — store noun,
 * naming guidance, fallback listing values, receipt wording, and so on.
 *
 * The `jewellery` preset must stay equivalent to the original hard-coded
 * jewellery behaviour (see verticals.test.ts) so existing stores are
 * unaffected. Category `key`s are what `products.category` stores; the
 * bilingual labels are display-only.
 */

export const VERTICALS = [
  "jewellery",
  "ceramics",
  "art",
  "vintage",
  "other",
] as const;

export type Vertical = (typeof VERTICALS)[number];

export function isVertical(value: string): value is Vertical {
  return (VERTICALS as readonly string[]).includes(value);
}

/** Every preset ends with this category; it can never be deleted. */
export const FALLBACK_CATEGORY_KEY = "Other";

export interface PresetCategory {
  /** Canonical value stored in `products.category`. English, ≤64 chars. */
  key: string;
  labelEn: string;
  labelDe: string;
  /**
   * Keys folded into this category's listing when browsing (e.g. jewellery
   * "Sets" surface under both Necklaces and Earrings).
   */
  extraIncludes?: readonly string[];
  /** EN/DE keyword hints fed to classification prompts. */
  synonyms?: readonly string[];
}

export interface VerticalPreset {
  vertical: Vertical;
  /** Picker labels for signup/settings. */
  labelEn: string;
  labelDe: string;
  /** e.g. `a jewellery boutique` — completes `"${storeName}", ${storeNoun}`. */
  storeNoun: string;
  /** Lower-case noun for a single listed item, e.g. `jewellery piece`. */
  itemNounEn: string;
  /**
   * The `- name:` / `- name_en:` / `- description:` / `- description_en:`
   * rule lines for the photo→listing prompt. Vertical-specific wording and
   * examples; the surrounding prompt structure is shared.
   */
  listingRules: string;
  /** Example product names for admin form placeholders. */
  exampleItemNameEn: string;
  exampleItemNameDe: string;
  /** Listing values used when AI extraction fails. */
  fallback: {
    name: string;
    nameEn: string;
    description: string;
    descriptionEn: string;
  };
  /**
   * Handwritten-inventory OCR: how to use a page heading to infer what every
   * item on the page is (merchants label pages by box/shelf/drawer).
   */
  ocrHeadingHint: string;
  /** Last-resort-category caveats for the OCR prompt. */
  ocrCategoryNote: string;
  /** One-line store description served in each tenant's /llms.txt. */
  catalogueLine: string;
  /** Returns sentence on receipt emails (no leading separator). */
  returnsFooter: string;
  categories: readonly PresetCategory[];
}

export const VERTICAL_PRESETS: Record<Vertical, VerticalPreset> = {
  jewellery: {
    vertical: "jewellery",
    labelEn: "Jewellery",
    labelDe: "Schmuck",
    storeNoun: "a jewellery boutique",
    itemNounEn: "jewellery piece",
    listingRules: `- name: short elegant product name in Swiss German (2–5 words). Use "ss" instead of "ß". Name the specific stone or pearl type first, e.g. "Mondstein-Ohrhänger", "Labradorit-Armband", "Barockperlen-Kollier".
- name_en: same product name in English (2–5 words), e.g. "Moonstone Drop Earrings", "Labradorite Cuff Bracelet", "Baroque Pearl Necklace".
- description: EXACTLY ONE sentence in Swiss German (use "ss" not "ß"). Name the specific stone/pearl variety and material. Make it poetic and sensory — evoke colour, lustre, texture, and feeling. e.g. "Tief-violette Amethyst-Cabochons schimmern in einem handgefertigten Sterlingsilber-Rahmen – eleganz, die den Blick anzieht."
- description_en: EXACTLY ONE sentence in English. Same jewel specificity and lyrical tone. e.g. "Deep-violet amethyst cabochons shimmer in a hand-wrought sterling-silver setting — elegance that draws every eye."`,
    exampleItemNameEn: "Moonstone Drop Earrings",
    exampleItemNameDe: "Mondstein-Ohrhänger",
    fallback: {
      name: "Schmueckstück",
      nameEn: "Jewelry Piece",
      description: "Handgefertigtes Schmueckstück.",
      descriptionEn: "Handcrafted jewelry piece.",
    },
    ocrHeadingHint: `Look at the top of the page for a title or box label. This heading tells you what type of jewellery EVERY item on the page is, even when an item's own text is just a gemstone or material name and never says the word "ring", "necklace", etc. For example, on a page headed "Rings Box", an item written only as "Lemon Quartz - 50 CHF" is a ring — use the heading, not the item text, to know that.`,
    ocrCategoryNote: `- Treat "Sets" and "Other" as last-resort categories. Only use "Sets" when the item text explicitly describes a combined piece (e.g. a matching necklace-and-earring set). Only use "Other" when neither the page heading nor the item text gives any clue about the jewellery type.
- Never pick "Sets" or "Other" purely because a gemstone or material name by itself doesn't state the jewellery type — check the page heading first.`,
    catalogueLine:
      "Handcrafted jewelry and accessories, sold online and in person.",
    returnsFooter: "14-day returns on unworn, undamaged pieces",
    categories: [
      {
        key: "Necklaces",
        labelEn: "Necklaces",
        labelDe: "Halsketten",
        extraIncludes: ["Sets"],
        synonyms: [
          "necklaces",
          "pendants",
          "chokers",
          "lariats",
          "collar pieces",
          "kollier",
          "halskette",
          "kette",
          "anhänger",
        ],
      },
      {
        key: "Earrings",
        labelEn: "Earrings",
        labelDe: "Ohrringe",
        extraIncludes: ["Sets"],
        synonyms: [
          "studs",
          "drops",
          "hoops",
          "chandeliers",
          "ear cuffs",
          "ohrringe",
          "ohrstecker",
          "ohrhänger",
          "ohrclip",
        ],
      },
      {
        key: "Sets",
        labelEn: "Sets",
        labelDe: "Sets",
        synonyms: ["matching necklace-and-earring sets", "schmuckset"],
      },
      {
        key: "Rings",
        labelEn: "Rings",
        labelDe: "Ringe",
        synonyms: ["finger rings of any style", "ring", "fingerring"],
      },
      {
        key: "Bracelets",
        labelEn: "Bracelets",
        labelDe: "Armbänder",
        synonyms: [
          "chain bracelets",
          "cuffs",
          "charm bracelets",
          "flexible wrist pieces",
          "armband",
        ],
      },
      {
        key: "Bangles",
        labelEn: "Bangles",
        labelDe: "Armreifen",
        synonyms: ["rigid circular bangles", "armreif", "starre armreifen"],
      },
      {
        key: "Anklets",
        labelEn: "Anklets",
        labelDe: "Fussschmuck",
        synonyms: [
          "ankle chains",
          "payal",
          "fussband",
          "fußband",
          "knöchelkette",
        ],
      },
      {
        key: "Brooches",
        labelEn: "Brooches",
        labelDe: "Broschen",
        synonyms: [
          "pins",
          "brooches",
          "lapel jewellery",
          "brosche",
          "anstecknadel",
        ],
      },
      {
        key: "Hair Accessories",
        labelEn: "Hair Accessories",
        labelDe: "Haarschmuck",
        synonyms: [
          "hair pins",
          "maang tikka",
          "juda pins",
          "hair combs",
          "haarnadel",
          "haarschmuck",
          "haarspange",
        ],
      },
      { key: "Other", labelEn: "Other", labelDe: "Sonstiges" },
    ],
  },

  ceramics: {
    vertical: "ceramics",
    labelEn: "Ceramics & Pottery",
    labelDe: "Keramik & Töpferei",
    storeNoun: "a ceramics and pottery studio",
    itemNounEn: "ceramic piece",
    listingRules: `- name: short elegant product name in Swiss German (2–5 words). Use "ss" instead of "ß". Name the form and the clay body or glaze first, e.g. "Gesprenkelter Steinzeug-Becher", "Seladon-Knospenvase".
- name_en: same product name in English (2–5 words), e.g. "Speckled Stoneware Mug", "Celadon Bud Vase".
- description: EXACTLY ONE sentence in Swiss German (use "ss" not "ß"). Name the clay body, glaze and finish. Make it sensory — evoke colour, surface, weight and feel. e.g. "Handgedrehter Steinzeug-Becher mit gesprenkelter Glasur – warm in der Hand, gemacht für jeden Tag."
- description_en: EXACTLY ONE sentence in English. Same material specificity and warm tone. e.g. "A hand-thrown stoneware mug in a speckled glaze — warm in the hand, made for every day."`,
    exampleItemNameEn: "Speckled Stoneware Mug",
    exampleItemNameDe: "Steinzeug-Becher",
    fallback: {
      name: "Keramikstück",
      nameEn: "Ceramic Piece",
      description: "Handgefertigtes Keramikstück.",
      descriptionEn: "Handcrafted ceramic piece.",
    },
    ocrHeadingHint: `Look at the top of the page for a title or shelf/box label. This heading tells you what form EVERY item on the page is, even when an item's own text is just a glaze or clay name and never says the word "mug", "vase", etc. For example, on a page headed "Mugs shelf", an item written only as "Speckled White - 38 CHF" is a mug — use the heading, not the item text, to know that.`,
    ocrCategoryNote: `- Treat "Other" as a last-resort category. Only use "Other" when neither the page heading nor the item text gives any clue about the form.
- Never pick "Other" purely because a glaze or clay name by itself doesn't state the form — check the page heading first.`,
    catalogueLine:
      "Handcrafted ceramics and pottery, sold online and in person.",
    returnsFooter: "14-day returns on unused items in original condition",
    categories: [
      {
        key: "Mugs & Cups",
        labelEn: "Mugs & Cups",
        labelDe: "Tassen & Becher",
        synonyms: [
          "mugs",
          "cups",
          "tumblers",
          "espresso cups",
          "tasse",
          "becher",
        ],
      },
      {
        key: "Bowls",
        labelEn: "Bowls",
        labelDe: "Schalen",
        synonyms: ["bowls", "serving bowls", "ramen bowls", "schale", "schüssel"],
      },
      {
        key: "Plates & Platters",
        labelEn: "Plates & Platters",
        labelDe: "Teller & Platten",
        synonyms: ["plates", "platters", "dishes", "teller", "platte"],
      },
      {
        key: "Vases",
        labelEn: "Vases",
        labelDe: "Vasen",
        synonyms: ["vases", "bud vases", "vessels", "vase"],
      },
      {
        key: "Planters",
        labelEn: "Planters",
        labelDe: "Übertöpfe",
        synonyms: ["planters", "plant pots", "blumentopf", "übertopf"],
      },
      {
        key: "Jugs & Teapots",
        labelEn: "Jugs & Teapots",
        labelDe: "Krüge & Kannen",
        synonyms: [
          "jugs",
          "pitchers",
          "teapots",
          "carafes",
          "krug",
          "kanne",
          "teekanne",
        ],
      },
      {
        key: "Sculpture & Objects",
        labelEn: "Sculpture & Objects",
        labelDe: "Skulpturen & Objekte",
        synonyms: [
          "sculpture",
          "figurines",
          "decorative objects",
          "skulptur",
          "objekt",
        ],
      },
      {
        key: "Candle Holders",
        labelEn: "Candle Holders",
        labelDe: "Kerzenhalter",
        synonyms: [
          "candle holders",
          "candlesticks",
          "kerzenständer",
          "kerzenhalter",
        ],
      },
      { key: "Other", labelEn: "Other", labelDe: "Sonstiges" },
    ],
  },

  art: {
    vertical: "art",
    labelEn: "Art & Prints",
    labelDe: "Kunst & Drucke",
    storeNoun: "an independent art studio selling original works and prints",
    itemNounEn: "artwork",
    listingRules: `- name: short elegant product name in Swiss German (2–5 words). Use "ss" instead of "ß". Name the subject and the medium first, e.g. "Aquarell Bergsee", "Botanischer Linolschnitt".
- name_en: same product name in English (2–5 words), e.g. "Alpine Lake Watercolour", "Botanical Linocut Print".
- description: EXACTLY ONE sentence in Swiss German (use "ss" not "ß"). Name the medium, support and subject; mention edition or format only if visible. e.g. "Feines Aquarell eines Bergsees auf Büttenpapier – stille Farben, viel Licht."
- description_en: EXACTLY ONE sentence in English. Same specificity about medium and subject. e.g. "A delicate watercolour of an alpine lake on cotton rag paper — quiet colour, full of light."`,
    exampleItemNameEn: "Alpine Lake Watercolour",
    exampleItemNameDe: "Aquarell Bergsee",
    fallback: {
      name: "Kunstwerk",
      nameEn: "Artwork",
      description: "Handgefertigtes Kunstwerk.",
      descriptionEn: "Original handmade artwork.",
    },
    ocrHeadingHint: `Look at the top of the page for a title or drawer/folder label. This heading tells you what kind of work EVERY item on the page is, even when an item's own text is just a subject or title and never says the word "print", "painting", etc. For example, on a page headed "Prints drawer", an item written only as "Alpine Lake - 120 CHF" is a print — use the heading, not the item text, to know that.`,
    ocrCategoryNote: `- Treat "Other" as a last-resort category. Only use "Other" when neither the page heading nor the item text gives any clue about the kind of work.
- Never pick "Other" purely because a title by itself doesn't state the medium — check the page heading first.`,
    catalogueLine:
      "Original artworks and prints, sold online and in person.",
    returnsFooter: "14-day returns on unused items in original condition",
    categories: [
      {
        key: "Original Paintings",
        labelEn: "Original Paintings",
        labelDe: "Originalgemälde",
        synonyms: [
          "paintings",
          "oil",
          "acrylic",
          "watercolour originals",
          "gemälde",
          "ölbild",
          "aquarell",
        ],
      },
      {
        key: "Prints",
        labelEn: "Prints",
        labelDe: "Drucke",
        synonyms: [
          "art prints",
          "giclée",
          "screen prints",
          "risograph",
          "linocut",
          "druck",
          "kunstdruck",
          "siebdruck",
        ],
      },
      {
        key: "Drawings & Illustrations",
        labelEn: "Drawings & Illustrations",
        labelDe: "Zeichnungen & Illustrationen",
        synonyms: [
          "drawings",
          "sketches",
          "ink",
          "illustration",
          "zeichnung",
          "tusche",
        ],
      },
      {
        key: "Photography",
        labelEn: "Photography",
        labelDe: "Fotografie",
        synonyms: ["photographs", "photo prints", "foto", "fotografie"],
      },
      {
        key: "Mixed Media & Collage",
        labelEn: "Mixed Media & Collage",
        labelDe: "Mischtechnik & Collage",
        synonyms: ["mixed media", "collage", "mischtechnik"],
      },
      {
        key: "Sculpture & Objects",
        labelEn: "Sculpture & Objects",
        labelDe: "Skulpturen & Objekte",
        synonyms: ["sculpture", "3D works", "skulptur", "objekt"],
      },
      {
        key: "Cards & Stationery",
        labelEn: "Cards & Stationery",
        labelDe: "Karten & Papeterie",
        synonyms: [
          "greeting cards",
          "postcards",
          "karten",
          "postkarten",
          "papeterie",
        ],
      },
      { key: "Other", labelEn: "Other", labelDe: "Sonstiges" },
    ],
  },

  vintage: {
    vertical: "vintage",
    labelEn: "Vintage & Antiques",
    labelDe: "Vintage & Antiquitäten",
    storeNoun: "a vintage and antiques dealer",
    itemNounEn: "vintage item",
    listingRules: `- name: short elegant product name in Swiss German (2–5 words). Use "ss" instead of "ß". Lead with era or style, then the object, e.g. "Teak-Beistelltisch 60er", "Messing-Schreibtischlampe 1930er". Never invent an era you cannot see.
- name_en: same product name in English (2–5 words), e.g. "Mid-Century Teak Side Table", "1930s Brass Desk Lamp".
- description: EXACTLY ONE sentence in Swiss German (use "ss" not "ß"). Name era, material and visible condition honestly. e.g. "Teak-Beistelltisch aus den 60er-Jahren mit schöner Patina – stabil und sofort einsatzbereit."
- description_en: EXACTLY ONE sentence in English. Same honesty about era, material and condition. e.g. "A 1960s teak side table with a lovely patina — sturdy and ready for use."`,
    exampleItemNameEn: "Mid-Century Teak Side Table",
    exampleItemNameDe: "Teak-Beistelltisch 60er",
    fallback: {
      name: "Vintage-Stück",
      nameEn: "Vintage Item",
      description: "Vintage-Einzelstück.",
      descriptionEn: "One-off vintage find.",
    },
    ocrHeadingHint: `Look at the top of the page for a title or section label. This heading tells you what kind of object EVERY item on the page is, even when an item's own text is just a material or era and never says the word "lamp", "table", etc. For example, on a page headed "Lighting", an item written only as "Brass, 1930s - 220 CHF" is a lamp — use the heading, not the item text, to know that.`,
    ocrCategoryNote: `- Treat "Other" as a last-resort category. Only use "Other" when neither the page heading nor the item text gives any clue about the kind of object.
- Never pick "Other" purely because a material or era by itself doesn't state the object — check the page heading first.`,
    catalogueLine:
      "One-off vintage and antique finds, sold online and in person.",
    returnsFooter: "14-day returns on unused items in original condition",
    categories: [
      {
        key: "Furniture",
        labelEn: "Furniture",
        labelDe: "Möbel",
        synonyms: [
          "chairs",
          "tables",
          "cabinets",
          "dressers",
          "stuhl",
          "tisch",
          "schrank",
          "kommode",
        ],
      },
      {
        key: "Lighting",
        labelEn: "Lighting",
        labelDe: "Leuchten",
        synonyms: ["lamps", "sconces", "chandeliers", "lampe", "leuchte"],
      },
      {
        key: "Tableware & Glass",
        labelEn: "Tableware & Glass",
        labelDe: "Geschirr & Glas",
        synonyms: [
          "china",
          "porcelain",
          "glassware",
          "silverware",
          "porzellan",
          "geschirr",
          "glas",
          "besteck",
        ],
      },
      {
        key: "Decor & Objects",
        labelEn: "Decor & Objects",
        labelDe: "Deko & Objekte",
        synonyms: [
          "ornaments",
          "mirrors",
          "clocks",
          "curiosities",
          "spiegel",
          "uhr",
          "deko",
        ],
      },
      {
        key: "Jewellery & Watches",
        labelEn: "Jewellery & Watches",
        labelDe: "Schmuck & Uhren",
        synonyms: [
          "vintage jewellery",
          "brooches",
          "watches",
          "schmuck",
          "uhren",
        ],
      },
      {
        key: "Textiles & Rugs",
        labelEn: "Textiles & Rugs",
        labelDe: "Textilien & Teppiche",
        synonyms: ["rugs", "linens", "quilts", "teppich", "textilien"],
      },
      {
        key: "Books & Ephemera",
        labelEn: "Books & Ephemera",
        labelDe: "Bücher & Papier",
        synonyms: [
          "books",
          "maps",
          "posters",
          "postcards",
          "bücher",
          "plakate",
        ],
      },
      {
        key: "Art",
        labelEn: "Art",
        labelDe: "Kunst",
        synonyms: ["paintings", "prints", "engravings", "gemälde", "stiche"],
      },
      { key: "Other", labelEn: "Other", labelDe: "Sonstiges" },
    ],
  },

  other: {
    vertical: "other",
    labelEn: "Handmade & Other",
    labelDe: "Handgemachtes & Sonstiges",
    storeNoun: "an independent maker of handcrafted goods",
    itemNounEn: "handcrafted item",
    listingRules: `- name: short elegant product name in Swiss German (2–5 words). Use "ss" instead of "ß". Name the material and the object first, e.g. "Servierbrett Nussbaum", "Leinen-Kissenbezug".
- name_en: same product name in English (2–5 words), e.g. "Walnut Serving Board", "Linen Cushion Cover".
- description: EXACTLY ONE sentence in Swiss German (use "ss" not "ß"). Name material and making. Make it sensory — evoke texture, colour and use. e.g. "Handgefertigtes Servierbrett aus geöltem Nussbaum – warme Maserung, gemacht für viele Jahre."
- description_en: EXACTLY ONE sentence in English. Same material specificity and warm tone. e.g. "A hand-finished serving board in oiled walnut — warm grain, made to last."`,
    exampleItemNameEn: "Walnut Serving Board",
    exampleItemNameDe: "Servierbrett Nussbaum",
    fallback: {
      name: "Handgemachtes Stück",
      nameEn: "Handcrafted Item",
      description: "Handgefertigtes Einzelstück.",
      descriptionEn: "Handcrafted item.",
    },
    ocrHeadingHint: `Look at the top of the page for a title or box label. This heading tells you what kind of item EVERY entry on the page is, even when an entry's own text is just a material or size and never names the object. For example, on a page headed "Boards box", an item written only as "Walnut small - 45 CHF" is a serving board — use the heading, not the item text, to know that.`,
    ocrCategoryNote: `- Treat "Other" as a last-resort category. Only use "Other" when neither the page heading nor the item text gives any clue about the kind of item.
- Never pick "Other" purely because a material name by itself doesn't state the object — check the page heading first.`,
    catalogueLine: "Handcrafted goods, sold online and in person.",
    returnsFooter: "14-day returns on unused items in original condition",
    categories: [
      {
        key: "Home & Living",
        labelEn: "Home & Living",
        labelDe: "Haus & Wohnen",
        synonyms: ["home decor", "cushions", "vases", "deko", "wohnaccessoires"],
      },
      {
        key: "Kitchen & Dining",
        labelEn: "Kitchen & Dining",
        labelDe: "Küche & Tisch",
        synonyms: [
          "boards",
          "utensils",
          "table linen",
          "schneidebrett",
          "küchenhelfer",
        ],
      },
      {
        key: "Accessories",
        labelEn: "Accessories",
        labelDe: "Accessoires",
        synonyms: [
          "scarves",
          "belts",
          "keychains",
          "schal",
          "gürtel",
          "schlüsselanhänger",
        ],
      },
      {
        key: "Bags & Cases",
        labelEn: "Bags & Cases",
        labelDe: "Taschen & Etuis",
        synonyms: ["bags", "pouches", "wallets", "tasche", "etui", "portemonnaie"],
      },
      {
        key: "Stationery & Paper",
        labelEn: "Stationery & Paper",
        labelDe: "Papeterie",
        synonyms: ["notebooks", "cards", "prints", "notizbuch", "karten"],
      },
      {
        key: "Toys & Games",
        labelEn: "Toys & Games",
        labelDe: "Spielzeug & Spiele",
        synonyms: ["toys", "games", "puzzles", "spielzeug", "spiele"],
      },
      {
        key: "Seasonal",
        labelEn: "Seasonal",
        labelDe: "Saisonales",
        synonyms: ["christmas", "easter", "ornaments", "weihnachten", "ostern"],
      },
      { key: "Other", labelEn: "Other", labelDe: "Sonstiges" },
    ],
  },
};
