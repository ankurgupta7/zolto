/**
 * Onboarding derivation — the live checklist's single source of truth.
 *
 * Per docs/ARCHITECTURE.md §3.1: task completion is COMPUTED from real data
 * (product rows, connected Stripe account, Terminal location, ledger entries),
 * never stored as booleans that can drift. The only persisted state is the
 * wizard cursor / dismissal in tenants.onboardingStep (0 = fresh, n = wizard
 * progress, -1 = dismissed), written by the two mutations in routers/tenant.ts.
 *
 * Copy is NAMED here, not written here: each task carries i18next keys plus
 * the values to interpolate, and the client renders them in the merchant's
 * language (see OnboardingTask).
 */

import { MIGRATE_FROM_LABELS, type MigrateFromProvider } from "@shared/const";
import type { Tenant } from "../drizzle/schema";
import {
  countTenantProducts,
  countTenantStaff,
  getTenantSettings,
  hasPhotoConsumption,
} from "./db";
import { featuresForTenant } from "./_core/trpc";

export interface OnboardingTask {
  id: string;
  /**
   * i18next keys (admin namespace, `catalog.onboarding.tasks.*`) for the
   * merchant-facing copy, plus the values to interpolate into them.
   *
   * Language is a CLIENT concern: the server has no reliable notion of the
   * viewer's locale (the checklist is polled every 5s and can be open in two
   * languages at once), so it names the copy and the client renders it. Brand
   * names arrive as interpolation values — `provider` is a proper noun that is
   * never translated, `count` drives i18next pluralisation.
   */
  titleKey: string;
  bodyKey: string;
  params?: Record<string, string | number>;
  /** Where "Go there" takes the merchant. */
  href?: string;
  /** GuidedTour registry key (client/src/lib/tours.ts) for "Show me". */
  tourId?: string;
  done: boolean;
  /** Set when the task can't be completed in this deployment right now
   *  (e.g. Stripe prices unconfigured) — the UI greys it with this reason. */
  blockedReasonKey?: string;
}

export interface OnboardingStatus {
  tasks: OnboardingTask[];
  doneCount: number;
  totalCount: number;
  allDone: boolean;
  /** tenants.onboardingStep: wizard cursor, or -1 when dismissed. */
  cursor: number;
  dismissed: boolean;
}

export async function deriveOnboardingStatus(
  tenant: Tenant,
): Promise<OnboardingStatus> {
  const [settings, productCount, staffCount, aiPhotoUsed] = await Promise.all([
    getTenantSettings(tenant.id),
    countTenantProducts(tenant.id),
    countTenantStaff(tenant.id),
    hasPhotoConsumption(tenant.id),
  ]);

  const features = featuresForTenant(tenant);
  const tasks: OnboardingTask[] = [];

  tasks.push({
    id: "claim-admin",
    titleKey: "catalog.onboarding.tasks.claimAdmin.title",
    bodyKey: "catalog.onboarding.tasks.claimAdmin.body",
    done: staffCount >= 1,
  });

  tasks.push({
    id: "brand-store",
    titleKey: "catalog.onboarding.tasks.brandStore.title",
    bodyKey: "catalog.onboarding.tasks.brandStore.body",
    href: "/admin/billing",
    done: Boolean(settings?.logoUrl || settings?.primaryColor),
  });

  // "Already selling somewhere?" (signup) tailors the catalogue step toward
  // the matching importer, so a switching merchant is routed to the migration
  // flow instead of re-typing what they already keyed into Stripe/SumUp/
  // Worldline. Completion is the same real signal either way: a product row.
  const migrateFrom = (settings?.migrateFrom ??
    null) as MigrateFromProvider | null;
  if (migrateFrom === "sumup" || migrateFrom === "worldline") {
    const label = MIGRATE_FROM_LABELS[migrateFrom];
    tasks.push({
      id: "first-product",
      titleKey: "catalog.onboarding.tasks.firstProduct.migrateTitle",
      bodyKey: "catalog.onboarding.tasks.firstProduct.migrateBody",
      params: { provider: label },
      href: "/admin/products/import",
      done: productCount >= 1,
    });
  } else if (migrateFrom === "stripe") {
    tasks.push({
      id: "first-product",
      titleKey: "catalog.onboarding.tasks.firstProduct.stripeTitle",
      bodyKey: "catalog.onboarding.tasks.firstProduct.stripeBody",
      href: "/admin/products/import",
      done: productCount >= 1,
    });
  } else {
    tasks.push({
      id: "first-product",
      titleKey: "catalog.onboarding.tasks.firstProduct.title",
      bodyKey: "catalog.onboarding.tasks.firstProduct.body",
      href: "/admin",
      tourId: "add-product",
      done: productCount >= 1,
    });
  }

  tasks.push({
    id: "connect-stripe",
    titleKey: "catalog.onboarding.tasks.connectStripe.title",
    bodyKey:
      migrateFrom === "stripe"
        ? "catalog.onboarding.tasks.connectStripe.migrateBody"
        : "catalog.onboarding.tasks.connectStripe.body",
    href: "/admin",
    done: Boolean(tenant.stripeConnectedAccountId),
  });

  // Every plan can act on this: Free includes a monthly allowance of AI
  // photo shots (the "taste of AI"), and Pro is unmetered.
  tasks.push({
    id: "first-ai-photo",
    titleKey: "catalog.onboarding.tasks.firstAiPhoto.title",
    bodyKey: "catalog.onboarding.tasks.firstAiPhoto.body",
    href: "/admin",
    done: aiPhotoUsed,
  });

  // Plan-gated tasks only appear when the plan includes the feature — a free
  // merchant never sees tasks they can't act on.
  if (features?.maxStaff && features.maxStaff > 1) {
    tasks.push({
      id: "invite-staff",
      titleKey: "catalog.onboarding.tasks.inviteStaff.title",
      bodyKey: "catalog.onboarding.tasks.inviteStaff.body",
      // `count` (not `seats`) so i18next picks the plural form: French and
      // Italian agree the noun with the number, and this task only ever
      // renders above 1 seat but must still read right if that changes.
      params: { count: features.maxStaff },
      href: "/admin/billing",
      done: staffCount >= 2,
    });
  }

  if (features?.customDomain) {
    tasks.push({
      id: "custom-domain",
      titleKey: "catalog.onboarding.tasks.customDomain.title",
      bodyKey: "catalog.onboarding.tasks.customDomain.body",
      // The Domain page, not Plan & Billing — billing sells the feature, but
      // the field that completes this task (and the CNAME to copy) is here.
      href: "/admin/domain",
      done: Boolean(settings?.publicDomain),
    });
  }

  const posTask: OnboardingTask = {
    id: "pos-ready",
    titleKey: "catalog.onboarding.tasks.posReady.title",
    bodyKey: "catalog.onboarding.tasks.posReady.body",
    done: Boolean(tenant.terminalLocationId),
  };
  if (!posTask.done && !tenant.stripeConnectedAccountId) {
    posTask.blockedReasonKey =
      "catalog.onboarding.tasks.posReady.blockedStripe";
  }
  tasks.push(posTask);

  const doneCount = tasks.filter((t) => t.done).length;
  const cursor = tenant.onboardingStep ?? 0;
  return {
    tasks,
    doneCount,
    totalCount: tasks.length,
    allDone: doneCount === tasks.length,
    cursor,
    dismissed: cursor === -1,
  };
}
