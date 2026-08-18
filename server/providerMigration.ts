/**
 * Migrate-in from the payment providers merchants are leaving behind
 * (docs/planning/roadmap-backlog.md §1). The premise of Zolto is a painless
 * exit ramp off the incumbents — Stripe, SumUp, Worldline/SIX — so a merchant
 * who has already keyed their catalogue into one of them never re-types it.
 *
 * Two migration paths, both ending in the SAME reviewed import pipeline the
 * CSV importer already uses (client preview table → products.csvImport, which
 * upserts by name and validates categories):
 *
 * - **Stripe**: the tenant links the Stripe account they already own via
 *   Stripe Connect (server/stripeConnect.ts) — which also keeps their checkout
 *   working — and we read their product catalogue straight off the Stripe API
 *   on the connected account. One click, no files.
 * - **SumUp / Worldline**: those dashboards only offer CSV/statement exports,
 *   so we parse whatever they produce. European exports are messy — semicolon
 *   delimiters, decimal commas, "CHF 25.–" price strings, German/French/
 *   Italian headers — and this module normalizes all of it.
 *
 * Everything here is pure parsing/mapping (no db, no network) so it is
 * testable in isolation; the tRPC surface lives in server/routers/migration.ts.
 */

/** Providers whose exports arrive as an uploaded CSV file. */
export const CSV_MIGRATION_PROVIDERS = [
  "sumup",
  "worldline",
  "generic",
] as const;
export type CsvMigrationProvider = (typeof CSV_MIGRATION_PROVIDERS)[number];

/**
 * One catalogue item extracted from a provider export, before it is mapped
 * onto the tenant's own categories client-side. `price: null` means the
 * export had no readable price — the row is still returned so the merchant
 * can fill it in the preview table instead of losing the item.
 */
export interface MigrationRow {
  name: string;
  description: string;
  price: number | null;
  /** The provider's own category text, matched to store categories later. */
  rawCategory: string;
  quantity: number;
  imageUrl?: string;
}

export interface MigrationParseResult {
  rows: MigrationRow[];
  /** Human-readable notes the merchant should see before importing. */
  warnings: string[];
  /** Rows dropped because they had no recognizable item name. */
  skipped: number;
}

// ─── Low-level CSV mechanics ─────────────────────────────────────────────────

/**
 * Pick the delimiter by counting candidates outside quoted regions of the
 * header line. SumUp/Worldline exports from German/French locales use `;`
 * (Excel's list separator there); Stripe and anglophone tools use `,`.
 */
export function detectDelimiter(headerLine: string): "," | ";" | "\t" {
  const counts: Record<"," | ";" | "\t", number> = { ",": 0, ";": 0, "\t": 0 };
  let inQuote = false;
  for (const ch of headerLine) {
    if (ch === '"') inQuote = !inQuote;
    else if (!inQuote && (ch === "," || ch === ";" || ch === "\t")) {
      counts[ch]++;
    }
  }
  if (
    counts[";"] >= counts[","] &&
    counts[";"] >= counts["\t"] &&
    counts[";"] > 0
  )
    return ";";
  if (counts["\t"] > counts[","]) return "\t";
  return ",";
}

/**
 * Parse a whole delimited file, honouring quotes (including embedded
 * delimiters and newlines — SumUp descriptions contain both) and doubled
 * quote escapes. Strips a UTF-8 BOM, which Excel prepends to every export.
 */
export function parseDelimited(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const firstLineEnd = src.indexOf("\n");
  const delimiter = detectDelimiter(
    firstLineEnd === -1 ? src : src.slice(0, firstLineEnd),
  );

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuote = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"') {
      if (inQuote && src[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === delimiter && !inQuote) {
      row.push(field.trim());
      field = "";
    } else if ((ch === "\n" || ch === "\r") && !inQuote) {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field.trim());
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field.trim());
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

/** Collapse a header to a comparable key: "Preis (brutto)" → "preisbrutto". */
export function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9äöüéèàç]/g, "");
}

/**
 * Read a money amount the way Swiss/European exports write them:
 * "CHF 1'234.50", "Fr. 25.–", "12,50", "1.234,50", "EUR 9.90", "45.-".
 * Returns null when no positive number can be found.
 */
export function parseSwissAmount(raw: string): number | null {
  let s = raw
    .replace(/[A-Za-z]/g, "") // currency words: CHF, Fr, EUR…
    .replace(/['’\s]/g, "") // Swiss thousands apostrophe + spaces
    .replace(/[.,]\s*[-–—]$/, "") // trailing ".-" / ".–" (Rappen shorthand)
    .replace(/^[.,]+/, "") // separator left over from "Fr." / "chf."
    .trim();
  if (!s) return null;

  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  if (hasDot && hasComma) {
    // Whichever separator comes last is the decimal one; the other groups
    // thousands ("1.234,50" vs "1,234.50").
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    const parts = s.split(",");
    // "12,50" is a decimal comma; "1,234" (3 digits after) is thousands.
    if (parts.length === 2 && parts[1].length <= 2) {
      s = `${parts[0]}.${parts[1]}`;
    } else {
      s = s.replace(/,/g, "");
    }
  }

  const value = Number.parseFloat(s);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

// ─── Provider presets ────────────────────────────────────────────────────────

interface ProviderPreset {
  label: string;
  /** Header aliases (normalized form), first non-empty match wins. */
  nameKeys: string[];
  /** SumUp splits an item into item name + variation columns. */
  variantKeys: string[];
  descriptionKeys: string[];
  priceKeys: string[];
  categoryKeys: string[];
  quantityKeys: string[];
  imageKeys: string[];
  /**
   * Transaction/statement exports (Worldline) list the same article once per
   * sale — collapse to unique items instead of importing 200 "Espresso" rows.
   */
  dedupeByName: boolean;
}

// Aliases cover the English + German + French + Italian header spellings the
// providers' dashboards actually produce (Switzerland exports in all four).
const PRESETS: Record<CsvMigrationProvider, ProviderPreset> = {
  sumup: {
    label: "SumUp",
    nameKeys: [
      "itemname",
      "artikelname",
      "nomdelarticle",
      "nomearticolo",
      "productname",
      "produktname",
      "name",
      "item",
      "artikel",
    ],
    variantKeys: ["variations", "variante", "varianten", "variant", "option"],
    descriptionKeys: ["description", "beschreibung", "descrizione"],
    priceKeys: [
      "price",
      "preis",
      "prix",
      "prezzo",
      "grossprice",
      "pricegross",
      "preisbrutto",
      "bruttopreis",
      "amount",
      "betrag",
    ],
    categoryKeys: ["category", "kategorie", "categorie", "categoria"],
    quantityKeys: [
      "quantity",
      "menge",
      "quantite",
      "quantita",
      "stock",
      "bestand",
      "inventory",
      "lagerbestand",
    ],
    imageKeys: ["image", "imageurl", "bild", "photo", "picture"],
    dedupeByName: false,
  },
  worldline: {
    label: "Worldline / SIX",
    // Terminal/statement exports rarely have a clean "name" column — the
    // article text often travels in a description/label field, so those count
    // as name sources here.
    nameKeys: [
      "article",
      "artikel",
      "artikelname",
      "articlename",
      "bezeichnung",
      "produkt",
      "product",
      "item",
      "itemname",
      "name",
      "label",
      "libelle",
      "description",
      "beschreibung",
      "text",
      "buchungstext",
    ],
    variantKeys: [],
    descriptionKeys: ["details", "zusatztext", "remark", "bemerkung"],
    priceKeys: [
      "price",
      "preis",
      "prix",
      "prezzo",
      "amount",
      "betrag",
      "montant",
      "importo",
      "brutto",
      "grossamount",
      "transactionamount",
      "umsatz",
      "total",
    ],
    categoryKeys: ["category", "kategorie", "warengruppe", "categorie"],
    quantityKeys: ["quantity", "menge", "anzahl", "stueck", "stuck", "qty"],
    imageKeys: [],
    dedupeByName: true,
  },
  generic: {
    label: "CSV",
    nameKeys: ["name", "itemname", "artikelname", "productname", "produkt"],
    variantKeys: [],
    descriptionKeys: ["description", "desc", "beschreibung"],
    priceKeys: ["price", "preis", "prix", "amount", "betrag"],
    categoryKeys: ["category", "cat", "kategorie"],
    quantityKeys: ["quantity", "qty", "stock", "menge", "bestand"],
    imageKeys: ["imageurl", "image", "img", "photo"],
    dedupeByName: false,
  },
};

export function providerLabel(provider: CsvMigrationProvider): string {
  return PRESETS[provider].label;
}

function pick(row: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v?.trim()) return v.trim();
  }
  return "";
}

// ─── CSV provider parsing ────────────────────────────────────────────────────

/**
 * Turn a provider's CSV export into normalized migration rows. Never throws
 * on messy data — unusable rows are counted in `skipped` and structural
 * problems become `warnings`, so the merchant always sees what happened.
 */
export function parseProviderCsv(
  provider: CsvMigrationProvider,
  text: string,
): MigrationParseResult {
  const preset = PRESETS[provider];
  const warnings: string[] = [];

  const table = parseDelimited(text);
  if (table.length < 2) {
    return {
      rows: [],
      warnings: [
        `Could not find a header row plus data rows in this file — is it the ${preset.label} export CSV?`,
      ],
      skipped: 0,
    };
  }

  const headers = table[0].map(normalizeHeader);
  const records = table
    .slice(1)
    .map((cells) =>
      Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""])),
    );

  const nameRecognized = preset.nameKeys.some((k) => headers.includes(k));
  if (!nameRecognized) {
    warnings.push(
      `No item-name column recognized (found: ${table[0].filter(Boolean).join(", ")}). ` +
        `Rows without a name are skipped — check this is the ${preset.label} catalogue/product export.`,
    );
  }
  if (!preset.priceKeys.some((k) => headers.includes(k))) {
    warnings.push(
      "No price column recognized — prices are left empty for you to fill in before importing.",
    );
  }
  const currencyCell = table
    .slice(0, 6)
    .flat()
    .find((c) => /\bEUR\b|€/i.test(c));
  if (currencyCell) {
    warnings.push(
      "This export mentions EUR — amounts are imported as-is and your store sells in CHF, so double-check prices.",
    );
  }

  let skipped = 0;
  const rows: MigrationRow[] = [];
  for (const rec of records) {
    let name = pick(rec, preset.nameKeys);
    if (!name) {
      skipped++;
      continue;
    }
    const variant = pick(rec, preset.variantKeys);
    if (variant) name = `${name} — ${variant}`;

    const qtyRaw = pick(rec, preset.quantityKeys);
    const qty = Number.parseInt(qtyRaw, 10);

    rows.push({
      name,
      description: pick(rec, preset.descriptionKeys),
      price: parseSwissAmount(pick(rec, preset.priceKeys)),
      rawCategory: pick(rec, preset.categoryKeys),
      quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
      imageUrl: pick(rec, preset.imageKeys) || undefined,
    });
  }

  let result = rows;
  if (preset.dedupeByName) {
    // Statement exports repeat every article once per transaction. Keep one
    // row per item; a later occurrence refreshes price/category (statements
    // are chronological, so last-seen is the current price).
    const byName = new Map<string, MigrationRow>();
    for (const row of rows) {
      const key = row.name.trim().toLowerCase();
      const existing = byName.get(key);
      if (!existing) {
        byName.set(key, { ...row, quantity: 1 });
      } else {
        if (row.price !== null) existing.price = row.price;
        if (row.rawCategory) existing.rawCategory = row.rawCategory;
        if (row.description) existing.description = row.description;
      }
    }
    result = Array.from(byName.values());
    const collapsed = rows.length - result.length;
    if (collapsed > 0) {
      warnings.push(
        `${collapsed} repeated transaction row${collapsed !== 1 ? "s" : ""} collapsed — ` +
          "each article is imported once, with its most recent price. Set stock quantities in the preview.",
      );
    }
  }

  if (skipped > 0) {
    warnings.push(
      `${skipped} row${skipped !== 1 ? "s" : ""} had no item name and ${skipped !== 1 ? "were" : "was"} skipped.`,
    );
  }

  return { rows: result, warnings, skipped };
}

// ─── Stripe catalogue mapping ────────────────────────────────────────────────

/**
 * The slice of Stripe's Product (with `default_price` expanded) this mapping
 * reads. Declared structurally rather than importing Stripe's types so the
 * pure module stays dependency-free and trivially mockable.
 */
export interface StripeCatalogProduct {
  id: string;
  name: string;
  description?: string | null;
  images?: string[] | null;
  metadata?: Record<string, string> | null;
  default_price?:
    | string
    | {
        unit_amount?: number | null;
        currency?: string | null;
        recurring?: unknown | null;
      }
    | null;
}

/**
 * Map a tenant's Stripe product catalogue (fetched off their connected
 * account) to migration rows. Products without a usable price are kept with
 * `price: null` so the merchant fills them in rather than losing the item.
 */
export function mapStripeProducts(
  products: StripeCatalogProduct[],
): MigrationParseResult {
  const warnings: string[] = [];
  const rows: MigrationRow[] = [];
  const foreignCurrencies = new Set<string>();
  let unpriced = 0;
  let recurring = 0;

  for (const p of products) {
    if (!p.name?.trim()) continue;

    let price: number | null = null;
    const dp = p.default_price;
    if (dp && typeof dp === "object") {
      if (dp.recurring) recurring++;
      if (typeof dp.unit_amount === "number" && dp.unit_amount > 0) {
        price = Math.round(dp.unit_amount) / 100;
      }
      const currency = dp.currency?.toLowerCase();
      if (currency && currency !== "chf") foreignCurrencies.add(currency);
    }
    if (price === null) unpriced++;

    rows.push({
      name: p.name.trim(),
      description: p.description?.trim() ?? "",
      price,
      // Merchants commonly tag Stripe products via metadata; try the obvious keys.
      rawCategory: p.metadata?.category ?? p.metadata?.type ?? "",
      quantity: 1,
      imageUrl: p.images?.[0] || undefined,
    });
  }

  if (unpriced > 0) {
    warnings.push(
      `${unpriced} product${unpriced !== 1 ? "s" : ""} had no default price in Stripe — enter prices in the preview before importing.`,
    );
  }
  if (recurring > 0) {
    warnings.push(
      `${recurring} product${recurring !== 1 ? "s use" : " uses"} a recurring (subscription) price — the amount was imported as a one-off price, review before importing.`,
    );
  }
  if (foreignCurrencies.size > 0) {
    warnings.push(
      `Some Stripe prices are in ${Array.from(foreignCurrencies).join(", ").toUpperCase()} — amounts are imported as-is and your store sells in CHF, so double-check them.`,
    );
  }
  warnings.push(
    "Stripe doesn't track stock, so every product starts with quantity 1 — adjust stock in the preview.",
  );

  return { rows, warnings, skipped: products.length - rows.length };
}
