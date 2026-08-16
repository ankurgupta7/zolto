/**
 * Till (store plane) — a point of sale that runs in the browser.
 *
 * The native apps need a device the merchant owns and, on iPhone, an Apple
 * Developer membership: Tap to Pay needs Apple's managed proximity-reader
 * entitlement, and a free Apple account signs builds that expire weekly. This
 * page needs none of that, so a merchant can start selling in person on
 * whatever phone is already at the counter.
 *
 * Three buttons, because they cost three different amounts:
 *
 *   Card   a Stripe Checkout Session drawn as a QR the customer scans. Online
 *          card fees, and the only one that works for someone holding a card
 *          rather than a phone.
 *   TWINT  the merchant's own QR sticker (uploaded on the POS page). Pays them
 *          directly at TWINT's rate with no Stripe leg — the cheapest rail, and
 *          the one nothing can confirm automatically, so the cashier attests.
 *   Cash   counted by hand, as ever.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import {
  Banknote,
  Check,
  CreditCard,
  Loader2,
  Plus,
  QrCode,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { PageHeader, PrimaryButton, inputClass } from "@/components/admin/ui";
import {
  addCustomItem,
  buildSalePayload,
  cartTotalRappen,
  filterProducts,
  formatMinor,
  isBargained,
  parsePriceToRappen,
  removeLine,
  resetLinePrice,
  setLinePrice,
  toggleProduct,
  type TillCartLine,
  type TillProduct,
} from "./Till.logic";

/** How often the till asks whether a scanned card payment has landed. */
const POLL_INTERVAL_MS = 2500;

type Stage =
  | { kind: "building" }
  | {
      kind: "card";
      qrDataUrl: string;
      posOrderId: number;
      totalRappen: number;
    }
  | { kind: "twintQr"; totalRappen: number }
  | { kind: "recording" }
  | { kind: "paid"; posOrderId: number; totalRappen: number; method: string }
  | { kind: "failed"; message: string };

export default function Till() {
  const { t } = useTranslation("admin");

  const [lines, setLines] = useState<TillCartLine[]>([]);
  const [search, setSearch] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [stage, setStage] = useState<Stage>({ kind: "building" });

  const catalogue = trpc.till.products.useQuery(
    { includeHidden: showHidden },
    { retry: false },
  );

  const products: TillProduct[] = useMemo(
    () => catalogue.data?.products ?? [],
    [catalogue.data],
  );
  const currency = catalogue.data?.currency ?? "CHF";
  const twintQrUrl = catalogue.data?.twintQrUrl ?? null;
  const total = cartTotalRappen(lines);
  const money = (minor: number) => formatMinor(minor, currency);

  const startCard = trpc.till.startCardPayment.useMutation({
    onSuccess: (result) =>
      setStage({
        kind: "card",
        qrDataUrl: result.qrDataUrl,
        posOrderId: result.posOrderId,
        totalRappen: result.totalRappen,
      }),
    onError: (error) => setStage({ kind: "failed", message: error.message }),
  });

  const recordAttested = trpc.till.recordAttestedSale.useMutation({
    onSuccess: (result, variables) =>
      setStage({
        kind: "paid",
        posOrderId: result.posOrderId,
        totalRappen: result.totalRappen,
        method: variables.method,
      }),
    onError: (error) => setStage({ kind: "failed", message: error.message }),
  });

  // Only polls while a card QR is actually on screen.
  const cardOrderId = stage.kind === "card" ? stage.posOrderId : null;
  const orderStatus = trpc.till.orderStatus.useQuery(
    { posOrderId: cardOrderId ?? 0 },
    {
      enabled: cardOrderId !== null,
      refetchInterval: POLL_INTERVAL_MS,
      retry: false,
    },
  );

  useEffect(() => {
    if (stage.kind !== "card") return;
    if (orderStatus.data?.status === "paid") {
      setStage({
        kind: "paid",
        posOrderId: stage.posOrderId,
        totalRappen: stage.totalRappen,
        method: "card",
      });
    }
  }, [orderStatus.data, stage]);

  const finish = () => {
    setLines([]);
    setStage({ kind: "building" });
    // The pieces just sold are gone from stock, so the grid is now wrong.
    catalogue.refetch();
  };

  const visible = filterProducts(products, search, null);

  return (
    <div>
      <PageHeader
        title={t("ops.till.title")}
        description={t("ops.till.description")}
        actions={
          <Link
            href="/admin/pos"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            {t("ops.till.posSettings")}
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        {/* ── Catalogue ─────────────────────────────────────────────────── */}
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative min-w-[12rem] flex-1">
              <Search
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("ops.till.searchPlaceholder")}
                aria-label={t("ops.till.searchPlaceholder")}
                className={`${inputClass} pl-9`}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={showHidden}
                onChange={(event) => setShowHidden(event.target.checked)}
              />
              {t("ops.till.showHidden")}
            </label>
          </div>

          {catalogue.isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          ) : visible.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {t("ops.till.noMatches")}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {visible.map((product) => {
                const inCart = lines.some(
                  (line) => line.key === String(product.id),
                );
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => setLines(toggleProduct(lines, product))}
                    aria-pressed={inCart}
                    className={`overflow-hidden rounded-xl border bg-card text-left transition-colors ${
                      inCart ? "border-primary ring-1 ring-primary" : ""
                    }`}
                  >
                    <div className="relative aspect-square bg-muted">
                      {product.imageUrl && (
                        <img
                          src={product.imageUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      )}
                      {inCart && (
                        <span className="absolute right-2 top-2 rounded-full bg-primary p-1 text-primary-foreground">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </div>
                    <div className="p-2.5">
                      <p className="line-clamp-2 text-xs leading-snug text-foreground">
                        {product.name}
                      </p>
                      <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                        {money(product.priceRappen)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Cart ──────────────────────────────────────────────────────── */}
        <aside className="self-start rounded-xl border bg-card lg:sticky lg:top-24">
          <Cart
            lines={lines}
            onChange={setLines}
            total={total}
            money={money}
            busy={startCard.isPending || recordAttested.isPending}
            twintQrUrl={twintQrUrl}
            onCard={() => {
              setStage({ kind: "recording" });
              startCard.mutate(buildSalePayload(lines));
            }}
            onTwintQr={() => setStage({ kind: "twintQr", totalRappen: total })}
            onCash={() => {
              setStage({ kind: "recording" });
              recordAttested.mutate({
                ...buildSalePayload(lines),
                method: "cash",
              });
            }}
          />
        </aside>
      </div>

      {stage.kind !== "building" && (
        <PaymentOverlay
          stage={stage}
          money={money}
          twintQrUrl={twintQrUrl}
          onConfirmTwint={() => {
            setStage({ kind: "recording" });
            recordAttested.mutate({
              ...buildSalePayload(lines),
              method: "twint_qr",
            });
          }}
          onCancel={() => setStage({ kind: "building" })}
          onDone={finish}
        />
      )}
    </div>
  );
}

function Cart({
  lines,
  onChange,
  total,
  money,
  busy,
  twintQrUrl,
  onCard,
  onTwintQr,
  onCash,
}: {
  lines: TillCartLine[];
  onChange: (lines: TillCartLine[]) => void;
  total: number;
  money: (minor: number) => string;
  busy: boolean;
  twintQrUrl: string | null;
  onCard: () => void;
  onTwintQr: () => void;
  onCash: () => void;
}) {
  const { t } = useTranslation("admin");
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");

  const empty = lines.length === 0;

  const commitEdit = (key: string) => {
    const minor = parsePriceToRappen(editPrice);
    if (minor !== null) onChange(setLinePrice(lines, key, minor));
    setEditing(null);
  };

  const addCustom = () => {
    const minor = parsePriceToRappen(customPrice);
    if (!customName.trim() || minor === null) return;
    onChange(addCustomItem(lines, customName, minor, String(Date.now())));
    setCustomName("");
    setCustomPrice("");
  };

  return (
    <div className="divide-y">
      <div className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("ops.till.thisSale")}
        </p>
      </div>

      <div className="max-h-[40vh] space-y-3 overflow-y-auto p-4">
        {empty ? (
          <p className="text-sm text-muted-foreground">
            {t("ops.till.emptyCart")}
          </p>
        ) : (
          lines.map((line) => (
            <div key={line.key} className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug text-foreground">
                  {line.name}
                </p>
                {editing === line.key ? (
                  <div className="mt-1 flex items-center gap-1.5">
                    {/* Width lives on the wrapper: `inputClass` ends in
                        `w-full`, and a `w-24` sitting beside it on the same
                        element loses — Tailwind's stylesheet order decides
                        which width wins, not the order they are written in. */}
                    <span className="w-24">
                      <input
                        autoFocus
                        value={editPrice}
                        onChange={(event) => setEditPrice(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") commitEdit(line.key);
                          if (event.key === "Escape") setEditing(null);
                        }}
                        inputMode="decimal"
                        aria-label={t("ops.till.priceFor", { name: line.name })}
                        className={inputClass}
                      />
                    </span>
                    <button
                      type="button"
                      onClick={() => commitEdit(line.key)}
                      className="text-xs font-medium text-primary"
                    >
                      {t("ops.till.setPrice")}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(line.key);
                      setEditPrice((line.priceRappen / 100).toFixed(2));
                    }}
                    className="mt-0.5 text-sm tabular-nums text-foreground"
                  >
                    {money(line.priceRappen)}
                    {isBargained(line) && line.listPriceRappen !== null && (
                      <span className="ml-1.5 text-muted-foreground line-through">
                        {money(line.listPriceRappen)}
                      </span>
                    )}
                  </button>
                )}
                {isBargained(line) && (
                  <button
                    type="button"
                    onClick={() => onChange(resetLinePrice(lines, line.key))}
                    className="mt-0.5 block text-xs text-muted-foreground underline"
                  >
                    {t("ops.till.resetPrice")}
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => onChange(removeLine(lines, line.key))}
                aria-label={t("ops.till.removeItem", { name: line.name })}
                className="p-1 text-muted-foreground transition-colors hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="space-y-2 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("ops.till.customItem")}
        </p>
        <div className="flex gap-2">
          <span className="min-w-0 flex-1">
            <input
              value={customName}
              onChange={(event) => setCustomName(event.target.value)}
              placeholder={t("ops.till.customName")}
              aria-label={t("ops.till.customName")}
              className={inputClass}
            />
          </span>
          <span className="w-20 shrink-0">
            <input
              value={customPrice}
              onChange={(event) => setCustomPrice(event.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              aria-label={t("ops.till.customPrice")}
              className={inputClass}
            />
          </span>
          <button
            type="button"
            onClick={addCustom}
            aria-label={t("ops.till.addCustom")}
            className="rounded-md bg-primary px-2.5 text-primary-foreground"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="p-4">
        <div className="mb-4 flex items-baseline justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("ops.till.total")}
          </span>
          <span className="text-2xl font-semibold tabular-nums text-foreground">
            {money(total)}
          </span>
        </div>

        <div className="space-y-2">
          <PrimaryButton
            disabled={empty || busy}
            onClick={onCard}
            className="w-full justify-center"
          >
            <CreditCard className="h-4 w-4" />
            {t("ops.till.payCard")}
          </PrimaryButton>
          {twintQrUrl && (
            <button
              type="button"
              disabled={empty || busy}
              onClick={onTwintQr}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <QrCode className="h-4 w-4" />
              {t("ops.till.payTwintQr")}
            </button>
          )}
          <button
            type="button"
            disabled={empty || busy}
            onClick={onCash}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Banknote className="h-4 w-4" />
            {t("ops.till.payCash")}
          </button>
        </div>
      </div>
    </div>
  );
}

function PaymentOverlay({
  stage,
  money,
  twintQrUrl,
  onConfirmTwint,
  onCancel,
  onDone,
}: {
  stage: Stage;
  money: (minor: number) => string;
  twintQrUrl: string | null;
  onConfirmTwint: () => void;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation("admin");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-foreground/80 p-6">
      <div className="w-full max-w-sm rounded-xl bg-card p-6 text-center">
        {stage.kind === "recording" && (
          <div className="py-10">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">
              {t("ops.till.recording")}
            </p>
          </div>
        )}

        {stage.kind === "card" && (
          <>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("ops.till.askToScan")}
            </p>
            <p className="my-3 text-3xl font-semibold tabular-nums text-foreground">
              {money(stage.totalRappen)}
            </p>
            <img
              src={stage.qrDataUrl}
              alt={t("ops.till.scanToPay")}
              className="mx-auto w-full max-w-[16rem] rounded-lg border bg-white"
            />
            <p className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("ops.till.waitingForPayment")}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("ops.till.cardMethodsNote")}
            </p>
            <button
              type="button"
              onClick={onCancel}
              className="mt-5 text-xs text-muted-foreground underline"
            >
              {t("ops.till.cancel")}
            </button>
          </>
        )}

        {stage.kind === "twintQr" && (
          <>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("ops.till.twintQrTitle")}
            </p>
            <p className="my-3 text-3xl font-semibold tabular-nums text-foreground">
              {money(stage.totalRappen)}
            </p>
            {twintQrUrl && (
              <img
                src={twintQrUrl}
                alt={t("ops.till.twintQrTitle")}
                className="mx-auto w-full max-w-[16rem] rounded-lg border bg-white"
              />
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              {t("ops.till.twintQrBody", {
                amount: money(stage.totalRappen),
              })}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("ops.till.twintQrAttestNote")}
            </p>
            <PrimaryButton
              onClick={onConfirmTwint}
              className="mt-5 w-full justify-center"
            >
              {t("ops.till.twintQrConfirm")}
            </PrimaryButton>
            <button
              type="button"
              onClick={onCancel}
              className="mt-3 text-xs text-muted-foreground underline"
            >
              {t("ops.till.cancel")}
            </button>
          </>
        )}

        {stage.kind === "paid" && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check className="h-8 w-8" />
            </div>
            <p className="mt-4 text-xl font-semibold text-foreground">
              {t("ops.till.saleRecorded")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              #{stage.posOrderId} · {t(`ops.till.method.${stage.method}`)}
            </p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">
              {money(stage.totalRappen)}
            </p>
            <PrimaryButton
              onClick={onDone}
              className="mt-6 w-full justify-center"
            >
              {t("ops.till.nextSale")}
            </PrimaryButton>
          </>
        )}

        {stage.kind === "failed" && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
              <X className="h-8 w-8" />
            </div>
            <p className="mt-4 text-xl font-semibold text-foreground">
              {t("ops.till.notRecorded")}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {stage.message}
            </p>
            <PrimaryButton
              onClick={onCancel}
              className="mt-6 w-full justify-center"
            >
              {t("ops.till.backToCart")}
            </PrimaryButton>
          </>
        )}
      </div>
    </div>
  );
}
