/**
 * AdminLayout — the admin shell (docs/ARCHITECTURE-ADMIN.md §2.3).
 *
 * A manifest-driven sidebar with two titled groups — "Shop" (store plane) and
 * "Zolto account" (account plane) — so the plane boundary is always visible.
 * Everything the sidebar shows comes from admin/nav.ts; role/plan only decide
 * display (hidden vs locked vs open) — the server enforces access.
 */

import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import * as icons from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  ADMIN_NAV,
  activeNavId,
  groupNavByPlane,
  resolveNavAccess,
  type AdminPlanId,
  type AdminRole,
} from "@/admin/nav";

/** Map a manifest icon name to its lucide component, with a safe fallback. */
function NavIcon({ name, className }: { name: string; className?: string }) {
  const Component =
    (icons as unknown as Record<string, icons.LucideIcon>)[name] ??
    icons.Circle;
  return <Component className={className} aria-hidden="true" />;
}

/** Display-level role: only tenant admins see the account plane. */
function displayRole(role: string | undefined): AdminRole {
  return role === "admin" || role === "superadmin" ? role : "staff";
}

export function AdminLayout({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const tenantMe = trpc.tenant.me.useQuery(undefined, { retry: false });
  const role = displayRole(user?.role);
  const plan = (tenantMe.data?.plan ?? "free") as AdminPlanId;
  const groups = groupNavByPlane(resolveNavAccess(ADMIN_NAV, { role, plan }));
  const [location] = useLocation();
  const currentId = activeNavId(ADMIN_NAV, location);

  // Mobile: the sidebar is an off-canvas drawer (fixed sidebars squash the page
  // on a phone). Closes whenever the route changes so a tap-through doesn't
  // leave it open over the new page.
  const [navOpen, setNavOpen] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: close the drawer on navigation
  useEffect(() => {
    setNavOpen(false);
  }, [location]);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile backdrop */}
      {navOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}

      <aside
        aria-label="Admin navigation"
        className={`fixed inset-y-0 left-0 z-40 w-60 shrink-0 overflow-y-auto border-r bg-muted/30 px-3 py-4 transition-transform md:static md:z-auto md:translate-x-0 ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <nav className="flex flex-col gap-6">
          {groups.map((group) => (
            <div key={group.plane}>
              <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.title}
              </p>
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const isActive = item.id === currentId;
                  const locked = item.access === "locked";
                  return (
                    <li key={item.id}>
                      <Link
                        href={item.path}
                        aria-current={isActive ? "page" : undefined}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                          isActive
                            ? "bg-accent font-medium text-foreground"
                            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                        }`}
                      >
                        <NavIcon
                          name={item.icon}
                          className="h-4 w-4 shrink-0"
                        />
                        <span className="flex-1 truncate">{item.label}</span>
                        {locked && (
                          <icons.Lock
                            className="h-3.5 w-3.5 text-muted-foreground"
                            aria-label={`Requires the ${item.requiredPlan} plan`}
                          />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b px-4 md:px-6">
          <button
            type="button"
            aria-label="Open navigation"
            aria-expanded={navOpen}
            onClick={() => setNavOpen(true)}
            className="-ml-1 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
          >
            <icons.Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <h1 className="text-lg font-semibold tracking-tight">
            {title ?? "Admin"}
          </h1>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

export default AdminLayout;
