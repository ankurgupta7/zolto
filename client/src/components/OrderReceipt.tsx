import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Printer } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";

interface OrderItem {
  id: number;
  name: string;
  nameEn: string | null;
  price: string;
  imageUrl: string | null;
}

interface OrderReceiptProps {
  reference: number;
  customerName?: string | null;
  customerEmail?: string | null;
  amountTotal: number; // in smallest unit (Rappen for CHF)
  paymentMethod?: string | null;
  createdAt: string; // ISO string
  items: OrderItem[];
}

function formatCHF(rappen: number) {
  return (rappen / 100).toFixed(2);
}

export default function OrderReceipt({
  reference,
  customerName,
  customerEmail,
  amountTotal,
  paymentMethod,
  createdAt,
  items,
}: OrderReceiptProps) {
  const { t } = useTranslation();
  const { branding } = useTenant();
  // Full store name under the short brand mark; omit if they're the same.
  const receiptSubtitle =
    branding.storeName !== branding.shortName ? branding.storeName : "";

  const orderRef = String(reference).padStart(5, "0");
  const date = new Date(createdAt).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const subtotalRappen = items.reduce(
    (sum, item) => sum + Math.round(parseFloat(item.price) * 100),
    0
  );
  const shippingRappen = amountTotal - subtotalRappen;

  // Isolate the receipt for printing: hide everything else, show only #order-receipt
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "receipt-print-style";
    style.textContent = `
      @media print {
        body * { visibility: hidden !important; }
        #order-receipt, #order-receipt * { visibility: visible !important; }
        #order-receipt {
          position: fixed !important;
          inset: 0 !important;
          width: 100% !important;
          max-width: 100% !important;
          padding: 48px !important;
          box-sizing: border-box !important;
          border: none !important;
        }
      }
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  return (
    <div className="mt-8">
      <div className="flex justify-end mb-3">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 border border-[var(--brand-ink)] text-[var(--brand-ink)] px-6 py-2.5 text-xs uppercase tracking-[0.15em] font-sans hover:bg-[var(--brand-ink)] hover:text-[var(--brand-accent)] transition-colors"
        >
          <Printer className="w-3.5 h-3.5" />
          {t("success.receipt.print")}
        </button>
      </div>

      <div id="order-receipt" className="border border-[var(--brand-border)] bg-white text-left">
        {/* Letterhead */}
        <div className="bg-[var(--brand-ink)] px-8 py-7 text-center">
          <p className="text-[var(--brand-accent)] text-xl tracking-[0.22em] uppercase font-serif mb-1">
            {branding.shortName}
          </p>
          {receiptSubtitle && (
            <p className="text-[#8A7865] text-xs tracking-[0.1em] font-sans">
              {receiptSubtitle}
            </p>
          )}
        </div>

        <div className="px-8 py-7">
          {/* Receipt header row */}
          <div className="flex justify-between items-start border-b border-[var(--brand-border)] pb-5 mb-6">
            <p className="text-[var(--brand-ink)] text-xs tracking-[0.18em] uppercase font-sans">
              {t("success.receipt.title")}
            </p>
            <div className="text-right">
              <p className="text-[var(--brand-ink)] text-sm font-sans">#{orderRef}</p>
              <p className="text-[var(--brand-muted-2)] text-xs font-sans mt-0.5">{date}</p>
            </div>
          </div>

          {/* Billed to */}
          {(customerName || customerEmail) && (
            <div className="mb-6">
              <p className="text-[var(--brand-ink)] text-xs tracking-[0.12em] uppercase font-sans mb-2">
                {t("success.receipt.billedTo")}
              </p>
              {customerName && (
                <p className="text-[var(--brand-ink)] text-sm font-serif">{customerName}</p>
              )}
              {customerEmail && (
                <p className="text-[var(--brand-muted-2)] text-xs font-sans mt-0.5">{customerEmail}</p>
              )}
            </div>
          )}

          {/* Items table */}
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--brand-border)]">
                <th className="w-0 p-0"></th>
                <th className="pb-2 text-left text-xs tracking-[0.1em] uppercase font-sans text-[var(--brand-muted-2)] font-normal">
                  {t("success.receipt.item")}
                </th>
                <th className="pb-2 text-right text-xs tracking-[0.1em] uppercase font-sans text-[var(--brand-muted-2)] font-normal">
                  {t("success.receipt.price")}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-[#F0EAE0]">
                  <td className="py-2 pr-3 w-14 align-middle">
                    {item.imageUrl && (
                      <a href={`/product/${item.id}`}>
                        <img
                          src={item.imageUrl}
                          alt={item.nameEn ?? item.name}
                          className="w-12 h-12 object-cover border border-[#F0EAE0] block"
                        />
                      </a>
                    )}
                  </td>
                  <td className="py-2.5 text-sm text-[var(--brand-ink)] font-serif pr-4 align-middle">
                    <a href={`/product/${item.id}`} className="hover:text-[var(--brand-accent)] transition-colors">
                      {item.nameEn ?? item.name}
                    </a>
                  </td>
                  <td className="py-2.5 text-sm text-[var(--brand-ink)] font-sans text-right whitespace-nowrap align-middle">
                    CHF {Number(item.price).toFixed(2)}
                  </td>
                </tr>
              ))}

              {shippingRappen > 0 && (
                <tr className="border-b border-[#F0EAE0]">
                  <td className="w-0 p-0"></td>
                  <td className="py-2.5 text-sm text-[var(--brand-muted-2)] font-sans pr-4">
                    {t("success.receipt.shipping")}
                  </td>
                  <td className="py-2.5 text-sm text-[var(--brand-muted-2)] font-sans text-right whitespace-nowrap">
                    CHF {formatCHF(shippingRappen)}
                  </td>
                </tr>
              )}

              <tr>
                <td className="w-0 p-0"></td>
                <td className="pt-4 pb-1 text-sm tracking-[0.1em] uppercase font-sans text-[var(--brand-ink)] pr-4">
                  {t("success.receipt.total")}
                </td>
                <td className="pt-4 pb-1 text-sm font-sans text-[var(--brand-ink)] text-right whitespace-nowrap font-semibold">
                  CHF {formatCHF(amountTotal)}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Payment method */}
          {paymentMethod && (
            <p className="mt-5 pt-4 border-t border-[var(--brand-border)] text-xs text-[var(--brand-muted-2)] font-sans">
              {t("success.receipt.paymentMethod")}:{" "}
              <span className="uppercase">{paymentMethod}</span>
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--brand-border)] px-8 py-4 text-center">
          <p className="text-[#A09080] text-xs font-sans leading-relaxed">
            {branding.contactEmail
              ? `${branding.contactEmail} · Thank you for your order`
              : "Thank you for your order"}
          </p>
        </div>
      </div>
    </div>
  );
}
