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
import { useTranslation } from "react-i18next";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import i18n from "@/lib/i18n";
import {
  DEFAULT_LANGUAGE,
  HTML_LANG,
  SUPPORTED_LANGUAGES,
  matchSupportedLanguage,
  type SupportedLanguage,
} from "@/lib/languages";
import {
  ADMIN_NAV,
  activeNavId,
  groupNavByPlane,
  resolveNavAccess,
  type AdminPlanId,
  type AdminRole,
} from "@/admin/nav";
import { navLabelKey } from "./ui";

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

/**
 * The same four-language switcher the storefront Navbar has, restyled for the
 * sidebar: persists the choice under "kalakosh_lang" and keeps <html lang>
 * truthful, so admin and storefront share one language preference.
 */
function LanguageSwitcher() {
  const { t, i18n: i18nInst } = useTranslation("admin");
  const currentLang =
    matchSupportedLanguage(i18nInst.language) ?? DEFAULT_LANGUAGE;

  const switchTo = (next: SupportedLanguage) => {
    i18n.changeLanguage(next);
    localStorage.setItem("kalakosh_lang", next);
    document.documentElement.lang = HTML_LANG[next];
  };

  return (
    <select
      value={currentLang}
      onChange={(e) => switchTo(e.target.value as SupportedLanguage)}
      aria-label={t("core.layout.switchLanguage")}
      className="w-full cursor-pointer appearance-none rounded-md border bg-background px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
    >
      {SUPPORTED_LANGUAGES.map((lang) => (
        <option key={lang} value={lang}>
          {lang.toUpperCase()}
        </option>
      ))}
    </select>
  );
}

export function AdminLayout({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation("admin");
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
          aria-label={t("core.layout.closeNav")}
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}

      <aside
        aria-label={t("core.layout.navLabel")}
        className={`fixed inset-y-0 left-0 z-40 w-60 shrink-0 overflow-y-auto border-r bg-muted/30 px-3 py-4 transition-transform md:static md:z-auto md:translate-x-0 ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <nav className="flex flex-col gap-6">
          {groups.map((group) => (
            <div key={group.plane}>
              <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t(`core.nav.groups.${group.plane}`, {
                  defaultValue: group.title,
                })}
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
                        <span className="flex-1 truncate">
                          {t(navLabelKey(item.label), {
                            defaultValue: item.label,
                          })}
                        </span>
                        {locked && (
                          <icons.Lock
                            className="h-3.5 w-3.5 text-muted-foreground"
                            aria-label={t("core.layout.requiresPlan", {
                              plan: item.requiredPlan,
                            })}
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
        {/* One placement covers desktop and the mobile drawer alike — the
            drawer is this same <aside>, just off-canvas until opened. */}
        <div className="mt-6 border-t px-3 pt-4">
          <LanguageSwitcher />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b px-4 md:px-6">
          <button
            type="button"
            aria-label={t("core.layout.openNav")}
            aria-expanded={navOpen}
            onClick={() => setNavOpen(true)}
            className="-ml-1 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
          >
            <icons.Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          {/* App.tsx passes the nav manifest's English label, so the header
              runs through the same lookup as the sidebar entry it mirrors and
              degrades to the given text for any non-manifest title. */}
          <h1 className="text-lg font-semibold tracking-tight">
            {title
              ? t(navLabelKey(title), { defaultValue: title })
              : t("core.layout.defaultTitle")}
          </h1>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

export default AdminLayout;
