import { Loader2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
// Shared primitive: rendered on both the storefront and the admin console, so
// its assistive-tech label follows the default (always-loaded) namespace.
import "@/lib/i18n";

import { cn } from "@/lib/utils";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  const { t } = useTranslation();
  return (
    <Loader2Icon
      role="status"
      aria-label={t("common.loading")}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
