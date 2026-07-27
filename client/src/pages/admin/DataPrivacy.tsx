/**
 * Data & privacy (account plane) — export your store's data and request
 * deletion. Export is a promise on every plan; the JSON is assembled from the
 * catalogue the admin already has access to, so no new server endpoint is
 * needed for a first, honest version.
 */
import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Download, ShieldAlert } from "lucide-react";
import {
  PageHeader,
  SettingsCard,
  PrimaryButton,
  SecondaryButton,
  AdminOnly,
} from "@/components/admin/ui";

export default function DataPrivacy() {
  const { user } = useAuth();
  const me = trpc.tenant.me.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();
  const [exporting, setExporting] = useState(false);

  if (user && user.role !== "admin" && user.role !== "superadmin") {
    return <AdminOnly />;
  }

  const handleExport = async () => {
    setExporting(true);
    try {
      const products = await utils.products.adminList.fetch();
      const payload = {
        exportedAt: new Date().toISOString(),
        store: {
          name: me.data?.name ?? null,
          slug: me.data?.slug ?? null,
          plan: me.data?.plan ?? null,
        },
        products,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${me.data?.slug ?? "store"}-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded.");
    } catch {
      toast.error("Could not build the export. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Data & privacy"
        description="Your data is yours. Export it any time, or ask us to delete your store."
      />

      <SettingsCard
        title="Export your data"
        description="Download your catalogue and store profile as a JSON file."
      >
        <PrimaryButton onClick={handleExport} loading={exporting}>
          <Download className="h-4 w-4" />
          Download export
        </PrimaryButton>
      </SettingsCard>

      <SettingsCard
        title="Delete your store"
        description="Permanently remove your store, catalogue, and data from Zolto."
      >
        <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Deletion is permanent and can't be undone. To protect against
            mistakes and confirm ownership, we handle it as a support request.
          </p>
        </div>
        <div className="mt-4">
          <SecondaryButton
            onClick={() =>
              (window.location.href =
                "mailto:support@zolto.ch?subject=Delete%20my%20store")
            }
          >
            Request deletion
          </SecondaryButton>
        </div>
      </SettingsCard>
    </div>
  );
}
