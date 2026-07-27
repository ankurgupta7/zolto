/**
 * Import (store plane) — the ways to get products into the catalogue in bulk.
 * A hub linking to the existing import tools (CSV import, bulk photo upload,
 * duplicate cleanup), which remain their own full-screen flows.
 */
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  FileSpreadsheet,
  Images,
  Copy,
  ArrowRight,
} from "lucide-react";
import { PageHeader, AdminOnly } from "@/components/admin/ui";

const TOOLS = [
  {
    href: "/admin/csv-import",
    icon: FileSpreadsheet,
    title: "CSV import",
    body: "Bring in a whole catalogue from a spreadsheet. Map your columns and preview before importing.",
  },
  {
    href: "/admin/bulk-upload",
    icon: Images,
    title: "Bulk photo upload",
    body: "Drop a batch of photos and let AI draft a name, description, and price for each piece.",
  },
  {
    href: "/admin/duplicates",
    icon: Copy,
    title: "Duplicate cleanup",
    body: "Find and merge near-identical products created by repeated imports.",
  },
] as const;

export default function Import() {
  const { user } = useAuth();
  if (user && user.role !== "admin" && user.role !== "superadmin") {
    return <AdminOnly />;
  }

  return (
    <div>
      <PageHeader
        title="Import"
        description="Add products in bulk — from a spreadsheet, a folder of photos, or by tidying duplicates."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {TOOLS.map(({ href, icon: Icon, title, body }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col rounded-xl border bg-card p-6 transition-colors hover:border-primary"
          >
            <Icon className="h-6 w-6 text-primary" />
            <h3 className="mt-4 text-base font-semibold text-foreground">
              {title}
            </h3>
            <p className="mt-1 flex-1 text-sm text-muted-foreground">{body}</p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
              Open
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
