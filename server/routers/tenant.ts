import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  router,
  publicProcedure,
  protectedProcedure,
  requireTenant,
} from "../_core/trpc";
import {
  db,
  getTenantBySlug,
  getTenantById,
  getTenantByReferralCode,
  createTenant,
  createTenantSettings,
  setTenantStripeCustomer,
  setTenantReferrer,
  createPendingTenantAdmin,
  getUserByOpenId,
  assignUserToTenantAsAdmin,
  deleteUserById,
} from "../db";
import { createStripeCustomer } from "../stripe";
import { tenants, tenantSettings } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

// ═══════════════════════════════════════════════════════════════════════════════
// Tenant Router — Self-service signup + tenant management
// ═══════════════════════════════════════════════════════════════════════════════

function generatePosApiKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

function generateReferralCode(): string {
  return crypto.randomBytes(8).toString("hex").toUpperCase();
}

export const tenantRouter = router({
  // ─── Public: Get tenant by slug (for store front) ──────────────────────────
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1).max(64) }))
    .query(async ({ input }) => {
      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.slug, input.slug),
      });

      if (!tenant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
      }

      return {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        plan: tenant.plan,
      };
    }),

  // ─── Public: Get tenant settings (branding) ──────────────────────────────
  getSettings: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.slug, input.slug),
      });
      if (!tenant) throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });

      const settings = await db.query.tenantSettings.findFirst({
        where: eq(tenantSettings.tenantId, tenant.id),
      });

      return settings || null;
    }),

  // ─── Public: Create tenant (self-service signup) ───────────────────────────
  // Auth is OAuth-only (no password), so signup provisions the store and a
  // *pending* admin, and returns a one-time claim token. The owner then signs in
  // with their identity provider and calls `claimAdmin` with the token to take
  // ownership. The token — not the email — is what authorizes the claim, so a
  // signup can't attach itself to someone else's login.
  create: publicProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      slug: z.string().regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens").min(3).max(64),
      email: z.string().email(),
      referralCode: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      // 1. Slug must be free.
      if (await getTenantBySlug(input.slug)) {
        throw new TRPCError({ code: "CONFLICT", message: "Store URL already taken" });
      }

      // 2. Create the tenant with a 14-day trial.
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 14);

      const tenantId = await createTenant({
        slug: input.slug,
        name: input.name,
        plan: "starter",
        posApiKey: generatePosApiKey(),
        trialEndsAt,
        referralCode: generateReferralCode(),
      });

      // 3. Default settings.
      await createTenantSettings({ tenantId, currency: "chf" });

      // 4. Stripe customer for future billing (no-op if Stripe isn't configured).
      const stripeCustomerId = await createStripeCustomer({
        name: input.name,
        email: input.email,
      });
      if (stripeCustomerId) {
        await setTenantStripeCustomer(tenantId, stripeCustomerId);
      }

      // 5. Referral: credit the referrer if the code is valid.
      if (input.referralCode) {
        const referrer = await getTenantByReferralCode(input.referralCode);
        if (referrer) await setTenantReferrer(tenantId, referrer.id);
      }

      // 6. Pending admin + one-time claim token (see claimAdmin below).
      const claimToken = crypto.randomBytes(32).toString("hex");
      await createPendingTenantAdmin(tenantId, input.email, claimToken);

      return {
        tenantId,
        slug: input.slug,
        trialEndsAt: trialEndsAt.toISOString(),
        claimToken,
      };
    }),

  // ─── Protected: Claim the admin slot for a freshly-created store ────────────
  // The signed-in user (any identity provider) exchanges the one-time token from
  // signup to become the store's admin. Requires authentication, so only the
  // person who completed signup — and then logged in — can claim it.
  claimAdmin: protectedProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const pending = await getUserByOpenId(`pending:${input.token}`);
      if (!pending || pending.role !== "admin") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invalid or already-claimed invitation",
        });
      }

      // Attach the authenticated user to the tenant as admin, then burn the
      // single-use pending row so the token can't be replayed.
      await assignUserToTenantAsAdmin(ctx.user.openId, pending.tenantId);
      await deleteUserById(pending.id);

      const tenant = await getTenantById(pending.tenantId);
      return { tenantId: pending.tenantId, slug: tenant?.slug ?? null };
    }),

  // ─── Protected: Get my tenant ──────────────────────────────────────────────
  me: publicProcedure
    .use(requireTenant)
    .query(async ({ ctx }) => {
      return ctx.tenant;
    }),

  // ─── Admin: Update tenant settings ────────────────────────────────────────
  updateSettings: publicProcedure
    .use(requireTenant)
    .input(z.object({
      logoUrl: z.string().url().optional(),
      primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      whatsappNumber: z.string().optional(),
      instagramHandle: z.string().optional(),
      metaTitle: z.string().optional(),
      metaDescription: z.string().optional(),
      contactEmail: z.string().email().optional(),
      contactPhone: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.query.tenantSettings.findFirst({
        where: eq(tenantSettings.tenantId, ctx.tenant.id),
      });

      if (existing) {
        await db.update(tenantSettings)
          .set({ ...input, updatedAt: new Date() })
          .where(eq(tenantSettings.id, existing.id));
      } else {
        await db.insert(tenantSettings).values({
          tenantId: ctx.tenant.id,
          ...input,
        });
      }

      return { success: true };
    }),

  // ─── Superadmin: List all tenants (platform admin) ───────────────────────
  list: publicProcedure
    .query(async () => {
      // TODO: Add superadmin guard
      return db.query.tenants.findMany();
    }),
});
