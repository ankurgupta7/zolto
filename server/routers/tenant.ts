import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { NOT_ADMIN_ERR_MSG } from "@shared/const";
import {
  router,
  publicProcedure,
  protectedProcedure,
  adminProcedure,
  requireTenant,
  PLAN_FEATURES,
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
import { buildConnectAuthorizeUrl } from "../stripeConnect";
import { deriveOnboardingStatus } from "../onboarding";
import { generatePosApiKey, hashPosApiKey } from "../posApiKey";
import { tenants, tenantSettings } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";

// ═══════════════════════════════════════════════════════════════════════════════
// Tenant Router — Self-service signup + tenant management
// ═══════════════════════════════════════════════════════════════════════════════

function generateReferralCode(): string {
  return crypto.randomBytes(8).toString("hex").toUpperCase();
}

// The POS API key is a bearer credential — a Tenant row must never leak it
// (or even its hash) through an API response. Strip it everywhere a tenant
// object is returned; the plaintext is only ever shown once at
// generation/rotation below.
function stripPosApiKey<T extends { posApiKey: string }>(
  tenant: T,
): Omit<T, "posApiKey"> {
  const rest: Partial<T> = { ...tenant };
  delete rest.posApiKey;
  return rest as Omit<T, "posApiKey">;
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
      if (!tenant)
        throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });

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
    .input(
      z.object({
        name: z.string().min(1).max(255),
        slug: z
          .string()
          .regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens")
          .min(3)
          .max(64),
        email: z.string().email(),
        referralCode: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      // 1. Slug must be free.
      if (await getTenantBySlug(input.slug)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Store URL already taken",
        });
      }

      // 2. Create the tenant with a 14-day trial. The POS key is stored ONLY
      // as a SHA-256 hash; the plaintext is returned here exactly once (the
      // tenant enters it into their POS app) and is unrecoverable afterwards —
      // a lost key is rotated, not retrieved (see rotatePosApiKey below).
      const posApiKeyPlaintext = generatePosApiKey();
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 14);

      const tenantId = await createTenant({
        slug: input.slug,
        name: input.name,
        plan: "free",
        posApiKey: hashPosApiKey(posApiKeyPlaintext),
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
      // The token is stored as `pending:<token>` in users.openId, which is
      // varchar(64). "pending:" is 8 chars, so the token must be ≤ 56 chars —
      // 24 bytes of hex is 48 chars (192 bits of entropy) and leaves margin.
      const claimToken = crypto.randomBytes(24).toString("hex");
      await createPendingTenantAdmin(tenantId, input.email, claimToken);

      return {
        tenantId,
        slug: input.slug,
        trialEndsAt: trialEndsAt.toISOString(),
        claimToken,
        // Shown ONCE — the UI must present it as such ("copy it now; it can't
        // be shown again"). Not stored anywhere in plaintext.
        posApiKey: posApiKeyPlaintext,
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
      if (pending?.role !== "admin") {
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
  me: publicProcedure.use(requireTenant).query(async ({ ctx }) => {
    return stripPosApiKey(ctx.tenant);
  }),

  // ─── Protected: Which store does the signed-in user belong to? ─────────────
  // Host-INDEPENDENT (unlike `me`, which resolves the tenant from the request
  // host): resolves from ctx.user.tenantId, so it works on the marketing
  // surface too. Powers the "go to your store" affordance for a returning
  // merchant who landed on zolto.ch and forgot their store's address. Returns
  // just what a link needs (slug + name), never the POS key; null if the user
  // isn't attached to a store.
  myStore: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user.tenantId) return null;
    const tenant = await getTenantById(ctx.user.tenantId);
    if (!tenant) return null;
    return { slug: tenant.slug, name: tenant.name };
  }),

  // ─── Admin: rotate the POS API key (show-once) ─────────────────────────────
  // The old key stops working the moment this returns — every POS terminal for
  // this tenant must be reconfigured with the new key. Like signup, the
  // plaintext is returned exactly once; only its SHA-256 is stored.
  rotatePosApiKey: adminProcedure.mutation(async ({ ctx }) => {
    const plaintext = generatePosApiKey();
    await db
      .update(tenants)
      .set({ posApiKey: hashPosApiKey(plaintext) })
      .where(eq(tenants.id, ctx.user.tenantId));
    return { posApiKey: plaintext };
  }),

  // ─── Admin: Onboarding checklist (derived — see server/onboarding.ts) ──────
  // Completion is computed from real data; only the wizard cursor/dismissal
  // persists (tenants.onboardingStep: 0 fresh, n wizard progress, -1 hidden).
  onboardingStatus: publicProcedure
    .use(requireTenant)
    .query(async ({ ctx }) => {
      return deriveOnboardingStatus(ctx.tenant);
    }),

  dismissOnboarding: publicProcedure
    .use(requireTenant)
    .mutation(async ({ ctx }) => {
      await db
        .update(tenants)
        .set({ onboardingStep: -1 })
        .where(eq(tenants.id, ctx.tenant.id));
      return { success: true };
    }),

  setOnboardingCursor: publicProcedure
    .use(requireTenant)
    .input(z.object({ step: z.number().int().min(0).max(10) }))
    .mutation(async ({ ctx, input }) => {
      // Cursor moves forward only — never rewinds a dismissed (-1) checklist.
      const current = ctx.tenant.onboardingStep ?? 0;
      if (current === -1 || input.step <= current) return { success: true };
      await db
        .update(tenants)
        .set({ onboardingStep: input.step })
        .where(eq(tenants.id, ctx.tenant.id));
      return { success: true };
    }),

  // ─── Admin: Custom domain DNS status ──────────────────────────────────────  // Live check whether the saved custom domain's DNS points at the platform
  // (PLATFORM_DOMAIN env, e.g. app.zolto.ch). Caddy's on-demand TLS only
  // issues a cert once the domain is both registered here and pointing at us.
  domainStatus: publicProcedure.use(requireTenant).query(async ({ ctx }) => {
    const settings = await db.query.tenantSettings.findFirst({
      where: eq(tenantSettings.tenantId, ctx.tenant.id),
    });
    const domain = settings?.publicDomain ?? null;
    const expected = process.env.PLATFORM_DOMAIN ?? null;
    if (!domain) return { domain: null, expected, pointsToUs: false };

    let pointsToUs = false;
    if (expected) {
      try {
        const dns = await import("node:dns/promises");
        const cnames = await dns
          .resolveCname(domain)
          .catch(() => [] as string[]);
        pointsToUs = cnames.some(
          (c) => c.replace(/\.$/, "").toLowerCase() === expected.toLowerCase(),
        );
      } catch {
        pointsToUs = false;
      }
    }
    return { domain, expected, pointsToUs };
  }),

  // ─── Admin: Update tenant settings ────────────────────────────────────────
  // Paid-tier fields are gated by the tenant's plan (PLAN_FEATURES):
  //   publicDomain — custom domain, Pro plan
  //   currency     — anything other than CHF needs multi-currency (Pro plan)
  // The checks live inline (not as middleware) because the same procedure also
  // accepts ungated branding fields on every plan.
  updateSettings: publicProcedure
    .use(requireTenant)
    .input(
      z.object({
        logoUrl: z.string().url().optional(),
        primaryColor: z
          .string()
          .regex(/^#[0-9A-Fa-f]{6}$/)
          .optional(),
        whatsappNumber: z.string().optional(),
        instagramHandle: z.string().optional(),
        metaTitle: z.string().optional(),
        metaDescription: z.string().optional(),
        contactEmail: z.string().email().optional(),
        contactPhone: z.string().optional(),
        publicDomain: z
          .string()
          .regex(/^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)+$/, {
            message: "Enter a bare domain like shop.example.com",
          })
          .max(255)
          .optional(),
        currency: z
          .string()
          .regex(/^[a-z]{3}$/, "Use a 3-letter currency code like chf or eur")
          .optional(),
        // Discord integration (IDs, not secrets — the bot token stays
        // platform-side in env; see .env.example "Discord Bot").
        discordChannelId: z
          .string()
          .regex(/^\d{17,20}$/, "A Discord channel ID is a 17–20 digit number")
          .optional(),
        discordOwnerUserId: z
          .string()
          .regex(/^\d{17,20}$/, "A Discord user ID is a 17–20 digit number")
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const features = PLAN_FEATURES[ctx.tenant.plan];

      if (input.publicDomain !== undefined && !features.customDomain) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "A custom domain requires the Pro plan. Please upgrade.",
        });
      }
      if (
        input.currency !== undefined &&
        input.currency !== "chf" &&
        !features.multiCurrency
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Multi-currency checkout requires the Pro plan. Please upgrade.",
        });
      }

      const existing = await db.query.tenantSettings.findFirst({
        where: eq(tenantSettings.tenantId, ctx.tenant.id),
      });

      if (existing) {
        await db
          .update(tenantSettings)
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

  // ─── Admin: Get this tenant's Stripe Connect authorize URL + status ───────
  // Lets a store admin link their OWN Stripe account for storefront checkout
  // (separate from Zolto's own subscription billing — see
  // server/stripeConnect.ts). `url` is null when Connect isn't configured on
  // the platform yet (STRIPE_CONNECT_CLIENT_ID unset).
  getStripeConnectUrl: adminProcedure
    .use(requireTenant)
    .query(async ({ ctx }) => {
      if (ctx.user!.tenantId !== ctx.tenant.id) {
        // Logged because the merchant-facing symptom is indistinguishable from
        // "Connect isn't configured" — both leave the client without a URL. The
        // usual cause is a session bound to a different tenant (e.g. the
        // platform owner, or a stale cookie) browsing a tenant subdomain, and
        // without this line there is nothing anywhere that says so.
        console.warn(
          `[StripeConnect] Refusing getStripeConnectUrl: user ${ctx.user!.id} ` +
            `belongs to tenant ${ctx.user!.tenantId} but is browsing tenant ` +
            `${ctx.tenant.id} (${ctx.tenant.slug}). Sign in as an admin of ` +
            `that store.`,
        );
        throw new TRPCError({
          code: "FORBIDDEN",
          message: NOT_ADMIN_ERR_MSG,
        });
      }
      const [tenant, url] = await Promise.all([
        getTenantById(ctx.tenant.id),
        buildConnectAuthorizeUrl(ctx.tenant.id, ctx.req),
      ]);
      return {
        url,
        connected: Boolean(tenant?.stripeConnectedAccountId),
      };
    }),

  // ─── Superadmin: List all tenants (platform admin) ───────────────────────
  list: publicProcedure.query(async () => {
    // TODO: Add superadmin guard
    const all = await db.query.tenants.findMany();
    return all.map(stripPosApiKey);
  }),
});
