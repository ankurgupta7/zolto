/**
 * Import (store plane) — the ways to get products into the catalogue in bulk.
 * A hub linking to the existing import tools (CSV import, bulk photo upload,
 * duplicate cleanup), which remain their own full-screen flows.
 */
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { FileSpreadsheet, Images, Copy, ArrowRight } from "lucide-react";
import { PageHeader, AdminOnly } from "@/components/admin/ui";
import SiteImportCard from "@/components/admin/SiteImportCard";

const TOOLS = [
  {
    href: "/admin/csv-import",
    icon: FileSpreadsheet,
    titleKey: "ops.import.csvTitle",
    bodyKey: "ops.import.csvBody",
  },
  {
    href: "/admin/bulk-upload",
    icon: Images,
    titleKey: "ops.import.photosTitle",
    bodyKey: "ops.import.photosBody",
  },
  {
    href: "/admin/duplicates",
    icon: Copy,
    titleKey: "ops.import.duplicatesTitle",
    bodyKey: "ops.import.duplicatesBody",
  },
] as const;

export default function Import() {
  const { t } = useTranslation("admin");
  const { user } = useAuth();
  if (user && user.role !== "admin" && user.role !== "superadmin") {
    return <AdminOnly />;
  }

  return (
    <div>
      <PageHeader
        title={t("ops.import.title")}
        description={t("ops.import.description")}
      />

      {/* The fastest way in goes first: one address, and the whole shop moves.
          The tools below are what you reach for when there is no old site. */}
      <SiteImportCard />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {TOOLS.map(({ href, icon: Icon, titleKey, bodyKey }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col rounded-xl border bg-card p-6 transition-colors hover:border-primary"
          >
            <Icon className="h-6 w-6 text-primary" />
            <h3 className="mt-4 text-base font-semibold text-foreground">
              {t(titleKey)}
            </h3>
            <p className="mt-1 flex-1 text-sm text-muted-foreground">
              {t(bodyKey)}
            </p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
              {t("ops.import.open")}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
