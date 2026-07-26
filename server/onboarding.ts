/**
 * Onboarding derivation — the live checklist's single source of truth.
 *
 * Per docs/ARCHITECTURE.md §3.1: task completion is COMPUTED from real data
 * (product rows, connected Stripe account, Terminal location, ledger entries),
 * never stored as booleans that can drift. The only persisted state is the
 * wizard cursor / dismissal in tenants.onboardingStep (0 = fresh, n = wizard
 * progress, -1 = dismissed), written by the two mutations in routers/tenant.ts.
 */

import type { Tenant } from "../drizzle/schema";
import {
  countTenantProducts,
  countTenantStaff,
  getTenantSettings,
  hasPhotoConsumption,
} from "./db";
import { isBillingConfigured, monthlyPhotoCredits } from "./billing";
import { PLAN_FEATURES, type PlanId } from "./_core/trpc";

export interface OnboardingTask {
  id: string;
  title: string;
  body: string;
  /** Where "Go there" takes the merchant. */
  href?: string;
  /** GuidedTour registry key (client/src/lib/tours.ts) for "Show me". */
  tourId?: string;
  done: boolean;
  /** Set when the task can't be completed in this deployment right now
   *  (e.g. Stripe prices unconfigured) — the UI greys it with this reason. */
  blockedReason?: string;
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

  const features = PLAN_FEATURES[tenant.plan as PlanId];
  const tasks: OnboardingTask[] = [];

  tasks.push({
    id: "claim-admin",
    title: "Claim your store",
    body: "Sign in so this account becomes the store's admin.",
    done: staffCount >= 1,
  });

  tasks.push({
    id: "brand-store",
    title: "Add your branding",
    body: "Upload your logo and pick your brand color — the storefront themes itself from these.",
    href: "/admin/billing",
    done: Boolean(settings?.logoUrl || settings?.primaryColor),
  });

  tasks.push({
    id: "first-product",
    title: "Add your first product",
    body: "Snap a photo and let the AI draft the description, or import a CSV of your catalog.",
    href: "/admin",
    tourId: "add-product",
    done: productCount >= 1,
  });

  tasks.push({
    id: "connect-stripe",
    title: "Connect payments",
    body: "Link your Stripe account to accept cards online and TWINT / Tap to Pay at the market.",
    href: "/admin",
    done: Boolean(tenant.stripeConnectedAccountId),
  });

  const aiTask: OnboardingTask = {
    id: "first-ai-photo",
    title: "Style a product photo with AI",
    body: "Turn one phone photo into a clean catalogue shot — costs one credit.",
    href: "/admin",
    done: aiPhotoUsed,
  };
  // Free plan has no monthly bucket, so its only way to get credits is buying
  // a pack — impossible when this deployment hasn't configured billing prices.
  if (
    !aiPhotoUsed &&
    monthlyPhotoCredits(tenant.plan) === 0 &&
    !isBillingConfigured()
  ) {
    aiTask.blockedReason =
      "Photo credits aren't purchasable on this deployment yet.";
  }
  tasks.push(aiTask);

  // Plan-gated tasks only appear when the plan includes the feature — a free
  // merchant never sees tasks they can't act on.
  if (features?.maxStaff && features.maxStaff > 1) {
    tasks.push({
      id: "invite-staff",
      title: "Invite your team",
      body: `Your plan includes ${features.maxStaff} staff seats — invite a teammate to run the register.`,
      href: "/admin/billing",
      done: staffCount >= 2,
    });
  }

  if (features?.customDomain) {
    tasks.push({
      id: "custom-domain",
      title: "Set up your custom domain",
      body: "Serve the store on your own domain with managed HTTPS.",
      href: "/admin/billing",
      done: Boolean(settings?.publicDomain),
    });
  }

  const posTask: OnboardingTask = {
    id: "pos-ready",
    title: "Take a card payment on your phone",
    body: "Install the Zolto POS app and sign in with your POS key — the first card sale finishes the setup automatically.",
    done: Boolean(tenant.terminalLocationId),
  };
  if (!posTask.done && !tenant.stripeConnectedAccountId) {
    posTask.blockedReason = "Connect Stripe first (the step above).";
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
