import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { useAuth } from "@/_core/hooks/useAuth";
import { isStoreAdminRole } from "@/admin/nav";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { SignInOptions } from "@/components/SignInOptions";
import type { ProductCategory } from "@shared/types";
import { VERTICAL_PRESETS, isVertical } from "@shared/verticals";
import { useCategories } from "@/hooks/useCategories";
import { useTenantSettings } from "@/components/admin/useTenantSettings";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Loader2,
  Download,
  ExternalLink,
  ChevronRight,
  NotebookPen,
  Sparkles,
  ArrowRightLeft,
  CreditCard,
  AlertTriangle,
} from "lucide-react";
import { Link } from "wouter";
import { resolveConnectPrompt } from "@/lib/connectPrompt";

// Row validation happens in plain functions outside the component (they are
// exported and unit-tested on their own), so they translate through the i18n
// singleton rather than a hook-provided `t`. The messages are stored on the
// row already rendered, which is fine: a row is re-validated on every edit.
function tError(key: string, params?: Record<string, unknown>): string {
  return i18n.t(`catalog.csv.errors.${key}`, { ns: "admin", ...params });
}

// ─── CSV parsing ──────────────────────────────────────────────────────────────

function parseRow(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === "," && !inQuote) {
      fields.push(field.trim());
      field = "";
    } else {
      field += ch;
    }
  }
  fields.push(field.trim());
  return fields;
}

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseRow(lines[0]).map((h) =>
    h.toLowerCase().replace(/[\s_-]+/g, ""),
  );
  return lines.slice(1).map((line) => {
    const values = parseRow(line);
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  });
}

// CSV import maps free-text categories onto the store's own category list
// (folded categories like the jewellery "Sets" are excluded — unmatched rows
// default to "Other"), matching the AI import flows. The list is per-tenant,
// so the mapping helpers take it as a parameter.

// Importing in small batches (rather than one request for all rows) bounds
// how long a single request can run and lets the UI show progress instead of
// a single spinner that can appear to hang on a large import.
export const IMPORT_CHUNK_SIZE = 5;

function normalizeCategory(
  raw: string,
  validCategories: readonly string[],
): ProductCategory | null {
  const lower = raw.trim().toLowerCase();
  return validCategories.find((c) => c.toLowerCase() === lower) ?? null;
}

function getField(raw: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const val = raw[k.toLowerCase().replace(/[\s_-]+/g, "")];
    if (val?.trim()) return val.trim();
  }
  return "";
}

export interface CsvRow {
  /**
   * The product's own id, from the `gwinn_id` column the spreadsheet mirror
   * publishes. Undefined for a hand-written CSV or a file from another platform;
   * when present the server matches on it instead of on the name, so an item
   * renamed in the sheet is updated rather than duplicated.
   */
  platformId?: number;
  name: string;
  nameEn?: string;
  nameFr?: string;
  nameIt?: string;
  description: string;
  descriptionEn?: string;
  descriptionFr?: string;
  descriptionIt?: string;
  price: number;
  category: ProductCategory;
  quantity: number;
  imageUrl?: string;
  _valid: boolean;
  _errors: string[];
  _selected: boolean;
}

export function mapRows(
  raw: Record<string, string>[],
  validCategories: readonly string[],
): CsvRow[] {
  return raw.map((r) => {
    const errors: string[] = [];
    const name = getField(r, "name");
    const description = getField(r, "description", "desc");
    const priceStr = getField(r, "price");
    const categoryStr = getField(r, "category", "cat");

    if (!name) errors.push(tError("nameRequired"));
    if (!description) errors.push(tError("descriptionRequired"));
    const price = parseFloat(priceStr.replace(/[^0-9.]/g, ""));
    if (!priceStr || Number.isNaN(price) || price <= 0)
      errors.push(tError("invalidPrice"));
    const category = normalizeCategory(categoryStr, validCategories);
    if (!category)
      errors.push(
        tError("categoryMustBeOneOf", {
          categories: validCategories.join(", "),
        }),
      );

    const qtyStr = getField(r, "quantity", "qty", "stock");
    const quantity = qtyStr ? parseInt(qtyStr, 10) : 1;

    // Not an error when absent or unparseable — an id is an optimisation for
    // sheets that came from us, and a CSV from anywhere else must still import.
    const idStr = getField(r, "platformId", "gwinn_id", "id");
    const platformId = /^\d+$/.test(idStr) ? parseInt(idStr, 10) : undefined;

    return {
      platformId: platformId && platformId > 0 ? platformId : undefined,
      name: name || "(empty)",
      nameEn: getField(r, "nameEn", "nameenglish", "name_en") || undefined,
      nameFr: getField(r, "nameFr", "namefrench", "name_fr") || undefined,
      nameIt: getField(r, "nameIt", "nameitalian", "name_it") || undefined,
      description: description || "",
      descriptionEn:
        getField(
          r,
          "descriptionEn",
          "description_en",
          "descen",
          "descriptionenglish",
        ) || undefined,
      descriptionFr:
        getField(
          r,
          "descriptionFr",
          "description_fr",
          "descfr",
          "descriptionfrench",
        ) || undefined,
      descriptionIt:
        getField(
          r,
          "descriptionIt",
          "description_it",
          "descit",
          "descriptionitalian",
        ) || undefined,
      price: Number.isNaN(price) ? 0 : price,
      category: (category ?? "Other") as ProductCategory,
      quantity: Number.isNaN(quantity) || quantity < 0 ? 1 : quantity,
      imageUrl:
        getField(
          r,
          "imageUrl",
          "image_url",
          "imageurl",
          "image",
          "img",
          "photo",
        ) || undefined,
      _valid: errors.length === 0,
      _errors: errors,
      _selected: true,
    };
  });
}

// Re-checks a row after an inline edit. Category isn't re-checked here since
// the preview table only ever lets the admin pick from the store's list.
export function revalidateRow(row: CsvRow): CsvRow {
  const errors: string[] = [];
  if (!row.name.trim()) errors.push(tError("nameRequired"));
  if (!row.description.trim()) errors.push(tError("descriptionRequired"));
  if (!row.price || row.price <= 0) errors.push(tError("invalidPrice"));
  return { ...row, _valid: errors.length === 0, _errors: errors };
}

// ─── Template download ────────────────────────────────────────────────────────

function downloadTemplate(example: {
  name: string;
  nameEn: string;
  nameFr: string;
  nameIt: string;
  description: string;
  descriptionEn: string;
  descriptionFr: string;
  descriptionIt: string;
  category: string;
}) {
  const headers =
    "gwinn_id,name,nameEn,nameFr,nameIt,description,descriptionEn,descriptionFr,descriptionIt,price,category,quantity,imageUrl";
  const exampleRow =
    // gwinn_id blank: a template row is a NEW product. It is filled in only by
    // the spreadsheet mirror, for items that already exist.
    `,"${example.name}","${example.nameEn}","${example.nameFr}","${example.nameIt}",` +
    `"${example.description}","${example.descriptionEn}","${example.descriptionFr}","${example.descriptionIt}",` +
    `185,${example.category},1,https://example.com/image.jpg`;
  const blob = new Blob([`${headers}\n${exampleRow}`], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "product-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Map AI handwritten items to CsvRow ───────────────────────────────────────

export function mapHandwrittenItems(
  items: Array<{
    name: string;
    description: string;
    price: number;
    category: string;
    quantity: number;
  }>,
  validCategories: readonly string[],
): CsvRow[] {
  return items.map((item) => {
    const errors: string[] = [];
    if (!item.name?.trim()) errors.push(tError("nameRequired"));
    if (!item.description?.trim()) errors.push(tError("descriptionRequired"));
    if (!item.price || item.price <= 0) errors.push(tError("invalidPrice"));
    const category = normalizeCategory(item.category ?? "", validCategories);
    if (!category) errors.push(tError("invalidCategory"));
    return {
      name: item.name?.trim() || "(empty)",
      description: item.description?.trim() || "",
      price: item.price ?? 0,
      category: (category ?? "Other") as ProductCategory,
      quantity: item.quantity ?? 1,
      _valid: errors.length === 0,
      _errors: errors,
      _selected: true,
    };
  });
}

// ─── Map provider-migration rows to CsvRow ────────────────────────────────────

/**
 * Rows as server/providerMigration.ts returns them — from a SumUp/Worldline
 * CSV export or the tenant's connected Stripe catalogue.
 */
export interface MigrationSourceRow {
  name: string;
  description: string;
  price: number | null;
  rawCategory: string;
  quantity: number;
  imageUrl?: string;
}

export function mapMigrationRows(
  items: MigrationSourceRow[],
  validCategories: readonly string[],
): CsvRow[] {
  return items.map((item) => {
    const errors: string[] = [];
    const name = item.name?.trim() ?? "";
    // Payment providers rarely carry a product description; the storefront
    // needs one, so start from the name and let the merchant refine it in
    // the preview instead of flagging every imported row as broken.
    const description = item.description?.trim() || name;
    if (!name) errors.push(tError("nameRequired"));
    if (!item.price || item.price <= 0) errors.push(tError("invalidPrice"));
    const category = normalizeCategory(item.rawCategory ?? "", validCategories);
    return {
      name: name || "(empty)",
      description,
      price: item.price ?? 0,
      category: (category ?? "Other") as ProductCategory,
      quantity: item.quantity > 0 ? item.quantity : 1,
      imageUrl: item.imageUrl || undefined,
      _valid: errors.length === 0,
      _errors: errors,
      _selected: true,
    };
  });
}

// ─── Main component ───────────────────────────────────────────────────────────

type Stage = "input" | "preview" | "done";

export default function CsvImport() {
  const { t } = useTranslation("admin");
  const { user, isAuthenticated, loading } = useAuth();
  const utils = trpc.useUtils();

  // The store's own categories (server-driven); folded ones (e.g. jewellery
  // "Sets") are not importable, matching the AI import flows.
  const { categories: storeCategories } = useCategories();
  const validCategories = useMemo(() => {
    const folded = new Set(storeCategories.flatMap((c) => c.extraIncludes));
    return storeCategories.map((c) => c.key).filter((k) => !folded.has(k));
  }, [storeCategories]);

  // Template example row per the store's vertical.
  const { settings } = useTenantSettings();
  const templateExample = useMemo(() => {
    const vertical =
      settings?.vertical && isVertical(settings.vertical)
        ? settings.vertical
        : "jewellery";
    const preset = VERTICAL_PRESETS[vertical];
    return {
      name: preset.exampleItemNameDe,
      nameEn: preset.exampleItemNameEn,
      nameFr: preset.exampleItemNameFr,
      nameIt: preset.exampleItemNameIt,
      description: preset.fallback.description,
      descriptionEn: preset.fallback.descriptionEn,
      descriptionFr: preset.fallback.descriptionFr,
      descriptionIt: preset.fallback.descriptionIt,
      category: validCategories[0] ?? "Other",
    };
  }, [settings?.vertical, validCategories]);

  const fileRef = useRef<HTMLInputElement>(null);
  const handwritingRef = useRef<HTMLInputElement>(null);
  const sumupRef = useRef<HTMLInputElement>(null);
  const worldlineRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("input");
  // Notes from the provider migration parse ("2 repeated rows collapsed",
  // "prices are in EUR"…) shown above the preview so they survive past a toast.
  const [migrationWarnings, setMigrationWarnings] = useState<string[]>([]);
  const [migrationBusy, setMigrationBusy] = useState<
    "stripe" | "sumup" | "worldline" | null
  >(null);
  const [sheetUrl, setSheetUrl] = useState("");
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [importResult, setImportResult] = useState<{
    created: number;
    updated: number;
    failed: string[];
  } | null>(null);
  const [handwritingPreviews, setHandwritingPreviews] = useState<string[]>([]);
  const [handwritingProgress, setHandwritingProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [importProgress, setImportProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  // Only used to preview which rows will create vs. update in place — never
  // written to directly from this page.
  const { data: existingProducts } = trpc.products.adminList.useQuery(
    undefined,
    { enabled: isAuthenticated && isStoreAdminRole(user?.role) },
  );
  const existingByName = new Map(
    (existingProducts ?? []).map((p) => [p.name.trim().toLowerCase(), p]),
  );

  const fetchSheetMutation = trpc.products.fetchSheetCsv.useMutation({
    onError: (e) => toast.error(e.message),
  });

  // ── Provider migration (Stripe / SumUp / Worldline) ───────────────────────
  const isAdmin = isAuthenticated && isStoreAdminRole(user?.role);
  const { data: migrationStatus } = trpc.migration.status.useQuery(undefined, {
    enabled: isAdmin,
  });
  const stripeConnected = Boolean(migrationStatus?.stripe.connected);
  // Only needed to offer the connect link when Stripe isn't linked yet.
  const stripeConnectQuery = trpc.tenant.getStripeConnectUrl.useQuery(
    undefined,
    { enabled: isAdmin && migrationStatus !== undefined && !stripeConnected },
  );

  const showMigrationResult = (
    rows: MigrationSourceRow[],
    warnings: string[],
    sourceLabel: string,
  ) => {
    if (rows.length === 0) {
      toast.error(
        warnings[0] ??
          t("catalog.csv.toasts.migrationEmpty", { source: sourceLabel }),
      );
      return;
    }
    setRows(mapMigrationRows(rows, validCategories));
    setMigrationWarnings(warnings);
    setStage("preview");
    toast.success(
      t("catalog.csv.toasts.migrationFound", {
        count: rows.length,
        source: sourceLabel,
      }),
    );
  };

  const handleStripeImport = async () => {
    if (!stripeConnected) {
      // Not linked yet: send them through the same Connect flow checkout
      // uses — linking once powers both payments and this import.
      const prompt = resolveConnectPrompt(stripeConnectQuery);
      if (prompt.kind === "redirect") {
        window.location.href = prompt.url;
      } else if (prompt.kind === "pending") {
        toast.info(prompt.message);
      } else {
        toast.error(prompt.message);
      }
      return;
    }
    setMigrationBusy("stripe");
    try {
      const result = await utils.client.migration.fetchStripeCatalog.mutate();
      showMigrationResult(result.rows, result.warnings, "Stripe");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
    } finally {
      setMigrationBusy(null);
    }
  };

  const handleProviderFile =
    (provider: "sumup" | "worldline", sourceLabel: string) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const reader = new FileReader();
      reader.onerror = () => toast.error(t("catalog.csv.toasts.readFailed"));
      reader.onload = async () => {
        setMigrationBusy(provider);
        try {
          const result = await utils.client.migration.parseProviderCsv.mutate({
            provider,
            csv: reader.result as string,
          });
          showMigrationResult(result.rows, result.warnings, sourceLabel);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          toast.error(message);
        } finally {
          setMigrationBusy(null);
        }
      };
      reader.readAsText(file, "UTF-8");
    };

  const loadCsv = (text: string) => {
    const raw = parseCsv(text);
    if (raw.length === 0) {
      toast.error(t("catalog.csv.toasts.noDataRows"));
      return;
    }
    const mapped = mapRows(raw, validCategories);
    setRows(mapped);
    setMigrationWarnings([]);
    setStage("preview");
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
      toast.error(t("catalog.csv.toasts.notCsv"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => loadCsv(reader.result as string);
    reader.onerror = () => toast.error(t("catalog.csv.toasts.readFailed"));
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read image"));
      reader.readAsDataURL(file);
    });

  const handleHandwritingFiles = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    const ALLOWED = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ];
    for (const file of files) {
      if (file.type && !ALLOWED.includes(file.type)) {
        toast.error(t("catalog.csv.toasts.badImageType", { file: file.name }));
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(t("catalog.csv.toasts.imageTooLarge", { file: file.name }));
        return;
      }
    }

    let dataUrls: string[];
    try {
      dataUrls = await Promise.all(files.map(readFileAsDataUrl));
    } catch {
      toast.error(t("catalog.csv.toasts.readImagesFailed"));
      return;
    }
    setHandwritingPreviews(dataUrls);
    setHandwritingProgress({ done: 0, total: dataUrls.length });

    const allItems: Array<{
      name: string;
      description: string;
      price: number;
      category: string;
      quantity: number;
    }> = [];
    const failedFiles: string[] = [];

    for (let i = 0; i < dataUrls.length; i++) {
      try {
        const result =
          await utils.client.products.parseHandwrittenInventory.mutate({
            imageData: dataUrls[i],
            mimeType: files[i].type || "image/jpeg",
          });
        allItems.push(...result.items);
      } catch {
        failedFiles.push(files[i].name);
      }
      setHandwritingProgress({ done: i + 1, total: dataUrls.length });
    }
    setHandwritingProgress(null);

    if (failedFiles.length > 0) {
      toast.error(
        t("catalog.csv.toasts.aiParseFailed", {
          files: failedFiles.join(", "),
        }),
      );
    }
    if (allItems.length === 0) {
      toast.error(t("catalog.csv.toasts.aiNoItems"));
      return;
    }
    const mapped = mapHandwrittenItems(allItems, validCategories);
    setRows(mapped);
    setMigrationWarnings([]);
    setStage("preview");
    toast.success(
      t("catalog.csv.toasts.aiExtracted", {
        items: t("catalog.csv.toasts.itemCount", { count: allItems.length }),
        photos: t("catalog.csv.toasts.photoCount", { count: dataUrls.length }),
      }),
    );
  };

  const updateRow = (index: number, patch: Partial<CsvRow>) => {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? revalidateRow({ ...r, ...patch }) : r)),
    );
  };

  const toggleRowSelected = (index: number, selected: boolean) => {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, _selected: selected } : r)),
    );
  };

  const toggleAllSelected = (selected: boolean) => {
    setRows((prev) => prev.map((r) => ({ ...r, _selected: selected })));
  };

  const handleFetchSheet = async () => {
    if (!sheetUrl.trim()) {
      toast.error(t("catalog.csv.toasts.enterSheetUrl"));
      return;
    }
    const result = await fetchSheetMutation.mutateAsync({
      url: sheetUrl.trim(),
    });
    loadCsv(result.csv);
  };

  const handleImport = async () => {
    const toImport = rows.filter((r) => r._valid && r._selected);
    if (toImport.length === 0) {
      toast.error(t("catalog.csv.toasts.noRowsSelected"));
      return;
    }

    const chunks: CsvRow[][] = [];
    for (let i = 0; i < toImport.length; i += IMPORT_CHUNK_SIZE) {
      chunks.push(toImport.slice(i, i + IMPORT_CHUNK_SIZE));
    }

    setImportProgress({ done: 0, total: chunks.length });
    let created = 0;
    let updated = 0;
    const failed: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      try {
        const result = await utils.client.products.csvImport.mutate({
          rows: chunks[i].map((r) => ({
            platformId: r.platformId,
            name: r.name,
            nameEn: r.nameEn,
            nameFr: r.nameFr,
            nameIt: r.nameIt,
            description: r.description,
            descriptionEn: r.descriptionEn,
            descriptionFr: r.descriptionFr,
            descriptionIt: r.descriptionIt,
            price: r.price,
            category: r.category,
            quantity: r.quantity,
            imageUrl: r.imageUrl,
          })),
        });
        created += result.created;
        updated += result.updated;
        failed.push(...result.failed);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[CsvImport] Batch import failed:", err);
        toast.error(t("catalog.csv.toasts.batchFailed", { message }));
        failed.push(...chunks[i].map((r) => r.name));
      }
      setImportProgress({ done: i + 1, total: chunks.length });
    }

    setImportProgress(null);
    setImportResult({ created, updated, failed });
    setStage("done");
    utils.products.adminList.invalidate();
    utils.products.list.invalidate();
  };

  // Auth guards
  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center pt-20">
        <Loader2 className="animate-spin text-[var(--brand-ink)]" size={32} />
      </div>
    );

  if (!isAuthenticated)
    return (
      <div className="min-h-screen flex items-center justify-center pt-20 bg-background">
        <div className="text-center max-w-sm">
          <h2 className="font-serif text-foreground text-2xl mb-4">
            {t("catalog.csv.auth.required")}
          </h2>
          <SignInOptions className="text-left" next={window.location.href} />
        </div>
      </div>
    );

  if (!isStoreAdminRole(user?.role))
    return (
      <div className="min-h-screen flex items-center justify-center pt-20 bg-background">
        <div className="text-center max-w-sm">
          <h2 className="font-serif text-foreground text-2xl mb-4">
            {t("catalog.csv.auth.denied")}
          </h2>
        </div>
      </div>
    );

  const validRows = rows.filter((r) => r._valid);
  const invalidRows = rows.filter((r) => !r._valid);
  const selectedForImport = rows.filter((r) => r._valid && r._selected);
  const allSelected = rows.length > 0 && rows.every((r) => r._selected);
  const someSelected = rows.some((r) => r._selected) && !allSelected;

  return (
    <div className="page-enter pt-20 min-h-screen bg-[var(--brand-surface)]">
      {/* Header */}
      <section className="bg-[var(--brand-ink)] py-10">
        <div className="container flex items-center justify-between">
          <div>
            <p className="text-[var(--brand-accent)] text-xs uppercase tracking-[0.3em] mb-1 font-sans">
              {t("catalog.csv.header.eyebrow")}
            </p>
            <h1 className="font-serif text-white text-2xl">
              {t("catalog.csv.header.title")}
            </h1>
            <p className="text-white/50 text-xs font-sans mt-1">
              {t("catalog.csv.header.description")}
            </p>
          </div>
          <Link
            href="/admin"
            className="text-white/60 hover:text-white text-xs uppercase tracking-[0.15em] font-sans transition-colors"
          >
            ← {t("catalog.csv.header.backToAdmin")}
          </Link>
        </div>
      </section>

      <div className="container py-8 max-w-5xl">
        {/* ── Stage: Input ── */}
        {stage === "input" && (
          <div>
            {/* Switching from another provider */}
            <div className="bg-white border border-[var(--brand-border)] p-6 mb-6">
              <div className="flex items-center gap-2 mb-1">
                <ArrowRightLeft
                  size={18}
                  className="text-[var(--brand-accent)]"
                />
                <h2 className="font-serif text-foreground text-lg">
                  {t("catalog.csv.migration.title")}
                </h2>
              </div>
              <p className="text-muted-foreground text-xs font-sans mb-5">
                {t("catalog.csv.migration.description")}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Stripe */}
                <div className="border border-[var(--brand-border)] p-4 flex flex-col">
                  <p className="font-serif text-foreground text-sm mb-1">
                    Stripe
                  </p>
                  <p className="text-muted-foreground text-xs font-sans mb-4 flex-1">
                    {stripeConnected
                      ? t("catalog.csv.migration.stripeLinked")
                      : t("catalog.csv.migration.stripeUnlinked")}
                  </p>
                  <button
                    type="button"
                    onClick={handleStripeImport}
                    disabled={migrationBusy !== null}
                    data-testid="migrate-stripe-button"
                    className="flex items-center justify-center gap-2 border border-[var(--brand-ink)] text-[var(--brand-ink)] px-4 py-2.5 text-xs uppercase tracking-[0.15em] font-sans hover:bg-[var(--brand-ink)] hover:text-white transition-colors disabled:opacity-60"
                  >
                    {migrationBusy === "stripe" ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <CreditCard size={13} />
                    )}
                    {migrationBusy === "stripe"
                      ? t("catalog.csv.migration.stripeFetching")
                      : stripeConnected
                        ? t("catalog.csv.migration.stripeImport")
                        : t("catalog.csv.migration.stripeConnect")}
                  </button>
                </div>
                {/* SumUp */}
                <div className="border border-[var(--brand-border)] p-4 flex flex-col">
                  <p className="font-serif text-foreground text-sm mb-1">
                    SumUp
                  </p>
                  <p className="text-muted-foreground text-xs font-sans mb-4 flex-1">
                    {t("catalog.csv.migration.sumupDescription")}
                  </p>
                  <button
                    type="button"
                    onClick={() => sumupRef.current?.click()}
                    disabled={migrationBusy !== null}
                    data-testid="migrate-sumup-button"
                    className="flex items-center justify-center gap-2 border border-[var(--brand-ink)] text-[var(--brand-ink)] px-4 py-2.5 text-xs uppercase tracking-[0.15em] font-sans hover:bg-[var(--brand-ink)] hover:text-white transition-colors disabled:opacity-60"
                  >
                    {migrationBusy === "sumup" ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Upload size={13} />
                    )}
                    {migrationBusy === "sumup"
                      ? t("catalog.csv.migration.readingExport")
                      : t("catalog.csv.migration.sumupUpload")}
                  </button>
                  <input
                    ref={sumupRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={handleProviderFile("sumup", "SumUp")}
                    data-testid="migrate-sumup-input"
                  />
                </div>
                {/* Worldline */}
                <div className="border border-[var(--brand-border)] p-4 flex flex-col">
                  <p className="font-serif text-foreground text-sm mb-1">
                    Worldline / SIX
                  </p>
                  <p className="text-muted-foreground text-xs font-sans mb-4 flex-1">
                    {t("catalog.csv.migration.worldlineDescription")}
                  </p>
                  <button
                    type="button"
                    onClick={() => worldlineRef.current?.click()}
                    disabled={migrationBusy !== null}
                    data-testid="migrate-worldline-button"
                    className="flex items-center justify-center gap-2 border border-[var(--brand-ink)] text-[var(--brand-ink)] px-4 py-2.5 text-xs uppercase tracking-[0.15em] font-sans hover:bg-[var(--brand-ink)] hover:text-white transition-colors disabled:opacity-60"
                  >
                    {migrationBusy === "worldline" ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Upload size={13} />
                    )}
                    {migrationBusy === "worldline"
                      ? t("catalog.csv.migration.readingExport")
                      : t("catalog.csv.migration.worldlineUpload")}
                  </button>
                  <input
                    ref={worldlineRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={handleProviderFile("worldline", "Worldline")}
                    data-testid="migrate-worldline-input"
                  />
                </div>
              </div>
            </div>

            {/* Template download */}
            <div className="bg-white border border-[var(--brand-border)] p-5 mb-6 flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="font-serif text-foreground text-sm mb-0.5">
                  {t("catalog.csv.template.title")}
                </p>
                <p className="text-muted-foreground text-xs font-sans">
                  {t("catalog.csv.template.columnsLabel")}{" "}
                  <span className="font-mono text-[11px]">
                    name, nameEn, nameFr, nameIt, description, descriptionEn,
                    descriptionFr, descriptionIt, price, category, quantity,
                    imageUrl
                  </span>
                </p>
                <p className="text-muted-foreground text-xs font-sans mt-0.5">
                  {t("catalog.csv.template.categoriesLabel")}{" "}
                  {validCategories.map((c, i) => (
                    <span key={c}>
                      {i > 0 && " · "}
                      <span className="font-mono">{c}</span>
                    </span>
                  ))}
                </p>
              </div>
              <button
                type="button"
                onClick={() => downloadTemplate(templateExample)}
                className="flex items-center gap-2 border border-[var(--brand-ink)] text-[var(--brand-ink)] px-5 py-2.5 text-xs uppercase tracking-[0.15em] font-sans hover:bg-[var(--brand-ink)] hover:text-white transition-colors flex-shrink-0"
              >
                <Download size={14} />
                {t("catalog.csv.template.download")}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* CSV File Upload */}
              <div className="bg-white border border-[var(--brand-border)] p-6">
                <div className="flex items-center gap-2 mb-4">
                  <FileSpreadsheet
                    size={18}
                    className="text-[var(--brand-accent)]"
                  />
                  <h2 className="font-serif text-foreground text-lg">
                    {t("catalog.csv.upload.title")}
                  </h2>
                </div>
                <p className="text-muted-foreground text-xs font-sans mb-5">
                  {t("catalog.csv.upload.descriptionPrefix")}{" "}
                  <em>{t("catalog.csv.upload.excelPath")}</em>.
                </p>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-full border-2 border-dashed border-[var(--brand-ink)]/20 hover:border-[var(--brand-accent)] transition-colors p-8 text-center group"
                >
                  <Upload
                    size={28}
                    className="mx-auto mb-2 text-[var(--brand-ink)]/30 group-hover:text-[var(--brand-accent)] transition-colors"
                  />
                  <p className="font-serif text-foreground text-sm mb-0.5">
                    {t("catalog.csv.upload.selectFile")}
                  </p>
                  <p className="text-muted-foreground text-xs font-sans">
                    {t("catalog.csv.upload.dragDrop")}
                  </p>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleFile}
                  data-testid="csv-file-input"
                />
              </div>

              {/* Google Sheets */}
              <div className="bg-white border border-[var(--brand-border)] p-6">
                <div className="flex items-center gap-2 mb-4">
                  <ExternalLink
                    size={18}
                    className="text-[var(--brand-accent)]"
                  />
                  <h2 className="font-serif text-foreground text-lg">
                    {t("catalog.csv.sheets.title")}
                  </h2>
                </div>
                <p className="text-muted-foreground text-xs font-sans mb-2">
                  {t("catalog.csv.sheets.shareBefore")}{" "}
                  <em>{t("catalog.csv.sheets.shareEmphasis")}</em>
                  {t("catalog.csv.sheets.shareAfter")}
                </p>
                <p className="text-muted-foreground text-xs font-sans mb-5">
                  {t("catalog.csv.sheets.columnsNote")}
                </p>
                <input
                  type="url"
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="w-full border border-[var(--brand-ink)]/20 px-4 py-2.5 text-sm font-sans focus:outline-none focus:border-[var(--brand-accent)] bg-transparent mb-4"
                />
                <button
                  type="button"
                  onClick={handleFetchSheet}
                  disabled={fetchSheetMutation.isPending || !sheetUrl.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-[var(--brand-ink)] text-white px-6 py-3 text-sm uppercase tracking-[0.15em] font-sans hover:bg-[var(--brand-ink-hover)] transition-colors disabled:opacity-60"
                >
                  {fetchSheetMutation.isPending ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <ChevronRight size={15} />
                  )}
                  {fetchSheetMutation.isPending
                    ? t("catalog.csv.sheets.fetching")
                    : t("catalog.csv.sheets.load")}
                </button>
              </div>
            </div>

            {/* Handwritten Inventory Photos */}
            <div className="mt-6 bg-white border border-[var(--brand-border)] p-6">
              <div className="flex items-center gap-2 mb-1">
                <NotebookPen size={18} className="text-[var(--brand-accent)]" />
                <h2 className="font-serif text-foreground text-lg">
                  {t("catalog.csv.handwriting.title")}
                </h2>
                <span className="ml-2 flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] text-[var(--brand-accent)] font-sans bg-[var(--brand-accent)]/10 px-2 py-0.5">
                  <Sparkles size={9} />
                  {t("catalog.csv.handwriting.aiBadge")}
                </span>
              </div>
              <p className="text-muted-foreground text-xs font-sans mb-5">
                {t("catalog.csv.handwriting.description")}
              </p>

              {handwritingProgress ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Sparkles
                    size={30}
                    className="text-[var(--brand-accent)] animate-pulse"
                  />
                  <p className="font-serif text-foreground">
                    {t("catalog.csv.handwriting.reading")}
                  </p>
                  <p className="text-muted-foreground text-xs font-sans">
                    {t("catalog.csv.handwriting.photoProgress", {
                      current: Math.min(
                        handwritingProgress.done + 1,
                        handwritingProgress.total,
                      ),
                      total: handwritingProgress.total,
                    })}
                  </p>
                  {handwritingPreviews.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-2 mt-3">
                      {handwritingPreviews.map((src, i) => (
                        <img
                          key={i}
                          src={src}
                          alt={t("catalog.csv.handwriting.uploadedAlt", {
                            index: i + 1,
                          })}
                          className={`h-24 w-24 object-cover border ${
                            i < handwritingProgress.done
                              ? "border-[var(--brand-accent)]"
                              : "border-[var(--brand-border)]"
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-4 items-start">
                  <button
                    type="button"
                    onClick={() => handwritingRef.current?.click()}
                    className="flex-1 border-2 border-dashed border-[var(--brand-ink)]/20 hover:border-[var(--brand-accent)] transition-colors p-8 text-center group"
                  >
                    <NotebookPen
                      size={28}
                      className="mx-auto mb-2 text-[var(--brand-ink)]/30 group-hover:text-[var(--brand-accent)] transition-colors"
                    />
                    <p className="font-serif text-foreground text-sm mb-0.5">
                      {t("catalog.csv.handwriting.upload")}
                    </p>
                    <p className="text-muted-foreground text-xs font-sans">
                      {t("catalog.csv.handwriting.formats")}
                    </p>
                  </button>
                  {handwritingPreviews.length > 0 && (
                    <div className="flex flex-wrap gap-2 flex-shrink-0">
                      {handwritingPreviews.map((src, i) => (
                        <img
                          key={i}
                          src={src}
                          alt={t("catalog.csv.handwriting.previousAlt", {
                            index: i + 1,
                          })}
                          className="w-16 h-16 object-cover border border-[var(--brand-border)]"
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
              <input
                ref={handwritingRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                multiple
                className="hidden"
                onChange={handleHandwritingFiles}
                data-testid="handwriting-file-input"
              />
            </div>
          </div>
        )}

        {/* ── Stage: Preview ── */}
        {stage === "preview" && (
          <div>
            {/* Notes from the provider-migration parse */}
            {migrationWarnings.length > 0 && (
              <div
                className="border border-amber-300 bg-amber-50 p-4 mb-6"
                data-testid="migration-warnings"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <AlertTriangle size={14} className="text-amber-600" />
                  <p className="font-sans text-xs uppercase tracking-[0.12em] text-amber-800">
                    {t("catalog.csv.preview.warningsTitle")}
                  </p>
                </div>
                <ul className="list-disc pl-5 space-y-1">
                  {migrationWarnings.map((w) => (
                    <li key={w} className="text-xs font-sans text-amber-900">
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Summary bar */}
            <div className="flex flex-wrap items-center gap-4 mb-6">
              <div className="flex items-center gap-2 bg-white border border-[var(--brand-border)] px-4 py-2.5">
                <CheckCircle2
                  size={16}
                  className="text-green-600 flex-shrink-0"
                />
                <span className="text-sm font-sans">
                  <strong>{validRows.length}</strong>{" "}
                  {t("catalog.csv.preview.validRows")}
                </span>
              </div>
              {invalidRows.length > 0 && (
                <div className="flex items-center gap-2 bg-white border border-[var(--brand-border)] px-4 py-2.5">
                  <XCircle size={16} className="text-red-500 flex-shrink-0" />
                  <span className="text-sm font-sans">
                    <strong>{invalidRows.length}</strong>{" "}
                    {t("catalog.csv.preview.errorRows")}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 bg-white border border-[var(--brand-border)] px-4 py-2.5">
                <span className="text-sm font-sans">
                  <strong>{selectedForImport.length}</strong>{" "}
                  {t("catalog.csv.preview.selectedForImport")}
                </span>
              </div>
              <div className="ml-auto flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setRows([]);
                    setStage("input");
                    setSheetUrl("");
                    setHandwritingPreviews([]);
                    setMigrationWarnings([]);
                  }}
                  disabled={importProgress !== null}
                  className="border border-[var(--brand-ink)]/20 text-muted-foreground px-5 py-2.5 text-xs uppercase tracking-[0.15em] font-sans hover:border-[var(--brand-ink)] hover:text-foreground transition-colors disabled:opacity-60"
                >
                  ← {t("catalog.csv.preview.back")}
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={
                    importProgress !== null || selectedForImport.length === 0
                  }
                  className="flex items-center gap-2 bg-[var(--brand-accent)] text-[var(--brand-ink)] px-6 py-2.5 text-xs uppercase tracking-[0.15em] font-sans font-medium hover:bg-[var(--brand-accent-light)] transition-colors disabled:opacity-60"
                >
                  {importProgress ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Upload size={14} />
                  )}
                  {importProgress
                    ? t("catalog.csv.preview.importing", {
                        done: importProgress.done,
                        total: importProgress.total,
                      })
                    : t("catalog.csv.preview.importButton", {
                        count: selectedForImport.length,
                      })}
                </button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground font-sans mb-4">
              {t("catalog.csv.preview.uncheckNote")}
            </p>

            {/* Preview table */}
            <div className="bg-white border border-[var(--brand-border)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-sans">
                  <thead>
                    <tr className="border-b border-[var(--brand-border)] bg-[var(--brand-surface)]">
                      <th className="text-left px-4 py-3 w-8">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = someSelected;
                          }}
                          onChange={(e) => toggleAllSelected(e.target.checked)}
                          aria-label={t("catalog.csv.table.selectAllAria")}
                        />
                      </th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-[0.12em] text-muted-foreground font-normal w-8"></th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-[0.12em] text-muted-foreground font-normal">
                        {t("catalog.csv.table.thName")}
                      </th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-[0.12em] text-muted-foreground font-normal">
                        {t("catalog.csv.table.thAction")}
                      </th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-[0.12em] text-muted-foreground font-normal hidden md:table-cell">
                        {t("catalog.csv.table.thCategory")}
                      </th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-[0.12em] text-muted-foreground font-normal">
                        {t("catalog.csv.table.thPrice")}
                      </th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-[0.12em] text-muted-foreground font-normal hidden sm:table-cell">
                        {t("catalog.csv.table.thQty")}
                      </th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-[0.12em] text-muted-foreground font-normal hidden lg:table-cell">
                        {t("catalog.csv.table.thImageUrl")}
                      </th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-[0.12em] text-muted-foreground font-normal">
                        {t("catalog.csv.table.thIssues")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => {
                      const match = existingByName.get(
                        row.name.trim().toLowerCase(),
                      );
                      return (
                        <tr
                          key={i}
                          className={`border-b border-[var(--brand-border)] last:border-0 ${!row._valid ? "bg-red-50/50" : ""} ${!row._selected ? "opacity-50" : ""}`}
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={row._selected}
                              onChange={(e) =>
                                toggleRowSelected(i, e.target.checked)
                              }
                              aria-label={t("catalog.csv.table.selectRowAria", {
                                name:
                                  row.name ||
                                  t("catalog.csv.table.rowFallback"),
                              })}
                            />
                          </td>
                          <td className="px-4 py-3">
                            {row._valid ? (
                              <CheckCircle2
                                size={15}
                                className="text-green-600"
                              />
                            ) : (
                              <XCircle size={15} className="text-red-500" />
                            )}
                          </td>
                          <td className="px-4 py-3 min-w-[200px]">
                            <input
                              type="text"
                              value={row.name}
                              onChange={(e) =>
                                updateRow(i, { name: e.target.value })
                              }
                              placeholder={t("catalog.csv.table.phName")}
                              className="w-full bg-transparent border-b border-transparent hover:border-[var(--brand-border)] focus:border-[var(--brand-accent)] focus:outline-none font-serif text-foreground text-sm py-0.5"
                            />
                            <input
                              type="text"
                              value={row.description}
                              onChange={(e) =>
                                updateRow(i, { description: e.target.value })
                              }
                              placeholder={t("catalog.csv.table.phDescription")}
                              className="w-full bg-transparent border-b border-transparent hover:border-[var(--brand-border)] focus:border-[var(--brand-accent)] focus:outline-none text-muted-foreground text-xs py-0.5 mt-0.5"
                            />
                            <input
                              type="text"
                              value={row.nameEn ?? ""}
                              onChange={(e) =>
                                updateRow(i, {
                                  nameEn: e.target.value || undefined,
                                })
                              }
                              placeholder={t("catalog.csv.table.phNameEn")}
                              className="w-full bg-transparent border-b border-transparent hover:border-[var(--brand-border)] focus:border-[var(--brand-accent)] focus:outline-none text-muted-foreground/80 text-[11px] italic py-0.5 mt-0.5"
                            />
                            <input
                              type="text"
                              value={row.descriptionEn ?? ""}
                              onChange={(e) =>
                                updateRow(i, {
                                  descriptionEn: e.target.value || undefined,
                                })
                              }
                              placeholder={t(
                                "catalog.csv.table.phDescriptionEn",
                              )}
                              className="w-full bg-transparent border-b border-transparent hover:border-[var(--brand-border)] focus:border-[var(--brand-accent)] focus:outline-none text-muted-foreground/80 text-[11px] italic py-0.5"
                            />
                            <input
                              type="text"
                              value={row.nameFr ?? ""}
                              onChange={(e) =>
                                updateRow(i, {
                                  nameFr: e.target.value || undefined,
                                })
                              }
                              placeholder={t("catalog.csv.table.phNameFr")}
                              className="w-full bg-transparent border-b border-transparent hover:border-[var(--brand-border)] focus:border-[var(--brand-accent)] focus:outline-none text-muted-foreground/80 text-[11px] italic py-0.5 mt-0.5"
                            />
                            <input
                              type="text"
                              value={row.descriptionFr ?? ""}
                              onChange={(e) =>
                                updateRow(i, {
                                  descriptionFr: e.target.value || undefined,
                                })
                              }
                              placeholder={t(
                                "catalog.csv.table.phDescriptionFr",
                              )}
                              className="w-full bg-transparent border-b border-transparent hover:border-[var(--brand-border)] focus:border-[var(--brand-accent)] focus:outline-none text-muted-foreground/80 text-[11px] italic py-0.5"
                            />
                            <input
                              type="text"
                              value={row.nameIt ?? ""}
                              onChange={(e) =>
                                updateRow(i, {
                                  nameIt: e.target.value || undefined,
                                })
                              }
                              placeholder={t("catalog.csv.table.phNameIt")}
                              className="w-full bg-transparent border-b border-transparent hover:border-[var(--brand-border)] focus:border-[var(--brand-accent)] focus:outline-none text-muted-foreground/80 text-[11px] italic py-0.5 mt-0.5"
                            />
                            <input
                              type="text"
                              value={row.descriptionIt ?? ""}
                              onChange={(e) =>
                                updateRow(i, {
                                  descriptionIt: e.target.value || undefined,
                                })
                              }
                              placeholder={t(
                                "catalog.csv.table.phDescriptionIt",
                              )}
                              className="w-full bg-transparent border-b border-transparent hover:border-[var(--brand-border)] focus:border-[var(--brand-accent)] focus:outline-none text-muted-foreground/80 text-[11px] italic py-0.5"
                            />
                          </td>
                          <td className="px-4 py-3">
                            {match ? (
                              <span
                                className="text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 font-sans bg-[#FFF0DC] text-[#8B5914]"
                                title={t("catalog.csv.table.updateTitle", {
                                  id: match.id,
                                })}
                              >
                                {t("catalog.csv.table.update", {
                                  id: match.id,
                                })}
                              </span>
                            ) : (
                              <span className="text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 font-sans bg-[#E8F4EC] text-[#2D6B4A]">
                                {t("catalog.csv.table.create")}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <select
                              value={row.category}
                              onChange={(e) =>
                                updateRow(i, {
                                  category: e.target.value as ProductCategory,
                                })
                              }
                              className="text-[10px] uppercase tracking-[0.1em] px-2 py-1 font-sans bg-[#E8E8E8] text-[#555] border-none focus:outline-none focus:ring-1 focus:ring-[var(--brand-accent)]"
                            >
                              {validCategories.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3 font-serif text-[var(--brand-ink)]">
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground">
                                CHF
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={row.price || ""}
                                onChange={(e) =>
                                  updateRow(i, {
                                    price: parseFloat(e.target.value) || 0,
                                  })
                                }
                                placeholder="0.00"
                                className="w-20 bg-transparent border-b border-transparent hover:border-[var(--brand-border)] focus:border-[var(--brand-accent)] focus:outline-none font-serif text-sm py-0.5"
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={row.quantity}
                              onChange={(e) => {
                                const quantity = parseInt(e.target.value, 10);
                                updateRow(i, {
                                  quantity:
                                    Number.isNaN(quantity) || quantity < 0
                                      ? 0
                                      : quantity,
                                });
                              }}
                              className="w-14 bg-transparent border-b border-transparent hover:border-[var(--brand-border)] focus:border-[var(--brand-accent)] focus:outline-none text-sm py-0.5"
                            />
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            <input
                              type="text"
                              value={row.imageUrl ?? ""}
                              onChange={(e) =>
                                updateRow(i, {
                                  imageUrl: e.target.value || undefined,
                                })
                              }
                              placeholder="https://…"
                              title={row.imageUrl}
                              className="w-full max-w-[180px] bg-transparent border-b border-transparent hover:border-[var(--brand-border)] focus:border-[var(--brand-accent)] focus:outline-none text-xs font-mono text-muted-foreground py-0.5"
                            />
                          </td>
                          <td className="px-4 py-3">
                            {row._errors.length > 0 ? (
                              <span className="text-xs text-red-600">
                                {row._errors.join("; ")}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/40">
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {invalidRows.length > 0 && (
              <p className="text-xs text-muted-foreground font-sans mt-3">
                {t("catalog.csv.preview.errorNote")}
              </p>
            )}
          </div>
        )}

        {/* ── Stage: Done ── */}
        {stage === "done" && importResult && (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-[var(--brand-ink)] rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 size={40} className="text-[var(--brand-accent)]" />
            </div>
            <h2 className="font-serif text-foreground text-3xl mb-3">
              {t("catalog.csv.done.created", { count: importResult.created })}
              {importResult.updated > 0 &&
                t("catalog.csv.done.updatedSuffix", {
                  count: importResult.updated,
                })}
            </h2>
            <p className="text-muted-foreground font-sans mb-2">
              {importResult.updated > 0
                ? `${t("catalog.csv.done.updatedNote")} `
                : ""}
              {t("catalog.csv.done.visibleNote")}
            </p>
            {importResult.failed.length > 0 && (
              <p className="text-amber-600 text-sm font-sans mb-4">
                {t("catalog.csv.done.failed", {
                  count: importResult.failed.length,
                  names: importResult.failed.join(", "),
                })}
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
              <button
                type="button"
                onClick={() => {
                  setStage("input");
                  setRows([]);
                  setImportResult(null);
                  setSheetUrl("");
                  setHandwritingPreviews([]);
                  setMigrationWarnings([]);
                }}
                className="flex items-center justify-center gap-2 border border-[var(--brand-ink)] text-[var(--brand-ink)] px-8 py-3 text-sm uppercase tracking-[0.15em] font-sans hover:bg-[var(--brand-ink)] hover:text-white transition-colors"
              >
                <Upload size={14} />
                {t("catalog.csv.done.importMore")}
              </button>
              <Link
                href="/admin"
                className="flex items-center justify-center gap-2 bg-[var(--brand-ink)] text-white px-8 py-3 text-sm uppercase tracking-[0.15em] font-sans hover:bg-[var(--brand-ink-hover)] transition-colors"
              >
                {t("catalog.csv.done.goToAdmin")}
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
