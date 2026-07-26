/**
 * AdminPlaceholder — transitional page for manifest routes whose section has
 * not been extracted from the old monolith yet (docs/ARCHITECTURE-ADMIN.md §9).
 * Keeps every sidebar link functional during the migration; each placeholder
 * is replaced by its real page in a later slice.
 */

import * as icons from "lucide-react";

export function AdminPlaceholder({
  label,
  icon,
}: {
  label: string;
  icon: string;
}) {
  const Icon =
    (icons as unknown as Record<string, icons.LucideIcon>)[icon] ?? icons.Circle;
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <Icon className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      <h2 className="text-xl font-semibold">{label}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        This section is being rebuilt as part of the new admin area and will
        appear here in an upcoming release.
      </p>
    </div>
  );
}

export default AdminPlaceholder;
