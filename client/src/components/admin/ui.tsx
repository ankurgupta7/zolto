/**
 * Shared admin UI kit (docs/ARCHITECTURE-ADMIN.md §6).
 *
 * Small, dependency-light building blocks so the extracted admin pages are
 * composition, not copy-paste: a page header, a settings card with an optional
 * save bar, an empty state, and a plan-gate upsell. Every admin page under the
 * `AdminLayout` shell is built from these.
 */

import type { ReactNode } from "react";
import { Link } from "wouter";
import { Loader2, Lock } from "lucide-react";

// ─── PageHeader ───────────────────────────────────────────────────────────────

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ─── SettingsCard ─────────────────────────────────────────────────────────────

export function SettingsCard({
  title,
  description,
  children,
  footer,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="mb-6 overflow-hidden rounded-xl border bg-card">
      {(title || description) && (
        <header className="border-b bg-muted/30 px-6 py-4">
          {title && <h3 className="text-sm font-semibold text-foreground">{title}</h3>}
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          )}
        </header>
      )}
      <div className="px-6 py-5">{children}</div>
      {footer && (
        <footer className="flex items-center justify-end gap-3 border-t bg-muted/20 px-6 py-3">
          {footer}
        </footer>
      )}
    </section>
  );
}

// ─── Field ────────────────────────────────────────────────────────────────────

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-xs font-medium uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-rose-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export const inputClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary";

// ─── Buttons ──────────────────────────────────────────────────────────────────

export function PrimaryButton({
  children,
  loading,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 ${props.className ?? ""}`}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  loading,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 ${props.className ?? ""}`}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
      {icon && <div className="text-muted-foreground">{icon}</div>}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ─── PlanGate ─────────────────────────────────────────────────────────────────

/**
 * Upsell shown in place of a plan-gated page's body. Display only — the server
 * still enforces the gate (docs/ARCHITECTURE-ADMIN.md §4); this just turns a
 * bare 403 into an actionable "upgrade" call.
 */
export function PlanGate({
  requiredPlan,
  feature,
}: {
  requiredPlan: string;
  feature: string;
}) {
  const plan = requiredPlan.charAt(0).toUpperCase() + requiredPlan.slice(1);
  return (
    <EmptyState
      icon={<Lock className="h-8 w-8" aria-hidden="true" />}
      title={`${feature} is a ${plan}-plan feature`}
      description={`Upgrade to ${plan} or above to unlock ${feature.toLowerCase()}.`}
      action={
        <Link
          href="/admin/account/plan"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          View plans
        </Link>
      }
    />
  );
}

// ─── AdminGate ────────────────────────────────────────────────────────────────

/**
 * Renders a friendly "admins only" notice for account-plane pages when the
 * viewer isn't a tenant admin. The server enforces the same rule (adminProcedure);
 * this is UX so a staff member sees a clear message, not a raw error.
 */
export function AdminOnly() {
  return (
    <EmptyState
      icon={<Lock className="h-8 w-8" aria-hidden="true" />}
      title="Admins only"
      description="This part of your Zolto account is managed by the store owner or an admin."
    />
  );
}
