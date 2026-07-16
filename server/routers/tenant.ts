import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, checkFeature, requireTenant } from "../_core/trpc";
import { db } from "../db";
import { tenants, tenantSettings, users } from "../../drizzle/schema";
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
  create: publicProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      slug: z.string().regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens").min(3).max(64),
      email: z.string().email(),
      password: z.string().min(8).max(100),
      referralCode: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      // 1. Check slug uniqueness
      const existing = await db.query.tenants.findFirst({
        where: eq(tenants.slug, input.slug),
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Store URL already taken" });
      }

      // 2. Create tenant with 14-day trial
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 14);

      const [tenant] = await db.insert(tenants).values({
        slug: input.slug,
        name: input.name,
        plan: "starter",
        posApiKey: generatePosApiKey(),
        trialEndsAt,
        referralCode: generateReferralCode(),
      }).$returningId();

      const tenantId = tenant.id;

      // 3. Create default settings
      await db.insert(tenantSettings).values({
        tenantId,
        currency: "chf",
      });

      // 4. Create admin user (you'll need to hash the password in real implementation)
      // NOTE: Use your existing auth system here
      // await db.insert(users).values({
      //   tenantId,
      //   email: input.email,
      //   role: "admin",
      //   // password: hashPassword(input.password),
      // });

      // 5. Handle referral
      if (input.referralCode) {
        const referrer = await db.query.tenants.findFirst({
          where: eq(tenants.referralCode, input.referralCode),
        });
        if (referrer) {
          await db.update(tenants)
            .set({ referredBy: referrer.id, referralDiscountApplied: true })
            .where(eq(tenants.id, tenantId));
        }
      }

      // 6. TODO: Create Stripe customer, send welcome email

      return {
        tenantId,
        slug: input.slug,
        trialEndsAt: trialEndsAt.toISOString(),
      };
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
