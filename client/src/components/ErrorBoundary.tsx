import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
// Ensure the shared i18n instance is initialized even when the boundary is
// rendered in isolation (e.g. under test) before main.tsx has run.
import "@/lib/i18n";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * The fallback screen, split out as a function component so it can read the
 * active language through `useTranslation` — hooks are unavailable inside the
 * class boundary itself.
 */
function ErrorFallback({ error }: { error: Error | null }) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-center min-h-screen p-8 bg-background">
      <div className="flex flex-col items-center w-full max-w-2xl p-8">
        <AlertTriangle
          size={48}
          className="text-destructive mb-6 flex-shrink-0"
        />

        <h2 className="text-xl mb-4">{t("errors.unexpected")}</h2>

        <div className="p-4 w-full rounded bg-muted overflow-auto mb-6">
          <pre className="text-sm text-muted-foreground whitespace-break-spaces">
            {error?.stack}
          </pre>
        </div>

        <button
          type="button"
          onClick={() => window.location.reload()}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg",
            "bg-primary text-primary-foreground",
            "hover:opacity-90 cursor-pointer",
          )}
        >
          <RotateCcw size={16} />
          {t("errors.reload")}
        </button>
      </div>
    </div>
  );
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} />;
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
