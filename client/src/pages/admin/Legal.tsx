/**
 * Legal & invoices (account plane) — links to the legal documents governing the
 * Gwinn relationship and a pointer to invoices (managed in Plan & billing via
 * Stripe). Static; the invoice archive itself lives on the Stripe customer.
 */
import { useTranslation } from "react-i18next";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link } from "wouter";
import { FileText, Receipt, Scale, Sparkles } from "lucide-react";
import { PageHeader, SettingsCard, AdminOnly } from "@/components/admin/ui";

export default function Legal() {
  const { t } = useTranslation("admin");
  const { user } = useAuth();
  if (user && user.role !== "admin" && user.role !== "superadmin") {
    return <AdminOnly />;
  }

  return (
    <div>
      <PageHeader
        title={t("store.legal.title")}
        description={t("store.legal.description")}
      />

      <SettingsCard title={t("store.legal.invoicesTitle")}>
        <div className="flex items-start gap-3">
          <Receipt className="mt-0.5 h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm text-foreground">
              {t("store.legal.invoicesNote")}
            </p>
            <Link
              href="/admin/account/plan"
              className="mt-1 inline-block text-sm font-medium text-primary hover:underline"
            >
              {t("store.legal.manageBilling")}
            </Link>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title={t("store.legal.documentsTitle")}>
        <ul className="divide-y">
          {[
            {
              icon: FileText,
              label: t("store.legal.terms"),
              href: "/legal/terms",
            },
            {
              icon: Scale,
              label: t("store.legal.privacy"),
              href: "/legal/privacy",
            },
          ].map(({ icon: Icon, label, href }) => (
            <li key={label}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 py-3 text-sm text-foreground transition-colors hover:text-primary"
              >
                <Icon className="h-4 w-4 text-muted-foreground" />
                {label}
              </a>
            </li>
          ))}
        </ul>
      </SettingsCard>

      <SettingsCard title={t("store.legal.aiTitle")}>
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {t("store.legal.aiNote")}
          </p>
        </div>
      </SettingsCard>
    </div>
  );
}
