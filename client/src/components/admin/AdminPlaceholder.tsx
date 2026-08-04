/**
 * AdminPlaceholder — transitional page for manifest routes whose section has
 * not been extracted from the old monolith yet (docs/ARCHITECTURE-ADMIN.md §9).
 * Keeps every sidebar link functional during the migration; each placeholder
 * is replaced by its real page in a later slice.
 */

import * as icons from "lucide-react";
import { useTranslation } from "react-i18next";
// Ensure the shared i18n instance is initialized even when this page is
// rendered in isolation (e.g. under test) before main.tsx has run.
import "@/lib/i18n";
import { navLabelKey } from "./ui";

export function AdminPlaceholder({
  label,
  icon,
}: {
  label: string;
  icon: string;
}) {
  const { t } = useTranslation("admin");
  const Icon =
    (icons as unknown as Record<string, icons.LucideIcon>)[icon] ?? icons.Circle;
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <Icon className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      {/* The label comes from the nav manifest, so it reuses the sidebar's
          translation and degrades to the manifest's English text. */}
      <h2 className="text-xl font-semibold">
        {t(navLabelKey(label), { defaultValue: label })}
      </h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        {t("core.placeholder.body")}
      </p>
    </div>
  );
}

export default AdminPlaceholder;
