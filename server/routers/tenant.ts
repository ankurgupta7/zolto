import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { MIGRATE_FROM_PROVIDERS, NOT_ADMIN_ERR_MSG } from "@shared/const";
import { TEMPLATE_IDS, STORE_TEMPLATES } from "@shared/templates";
import {
  router,
  publicProcedure,
  protectedProcedure,
  adminProcedure,
  requireTenant,
  tenantAdminProcedure,
  featuresForTenant,
} from "../_core/trpc";
import { entitlementsFor } from "@shared/entitlements";
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
  getStoreUserByEmail,
  getPendingTenantAdminByEmail,
  getUserByOpenId,
  assignUserToTenantAsAdmin,
  deleteUserById,
  seedTenantCategories,
  getTenantSettingsByDomain,
} from "../db";
import { VERTICALS } from "@shared/verticals";
import { createStripeCustomer } from "../stripe";
import { storagePut } from "../storage";
import {
  isTenantSecretsConfigured,
  listTenantSecrets,
  setTenantSecret,
  deleteTenantSecret,
} from "../tenantSecrets";
import {
  CHANNEL_SECRET_PROVIDERS,
  type ChannelSecretProvider,
} from "../channelCredentials";
import { startGatewayForToken } from "../discord";
import { buildSlackAuthorizeUrl, buildDiscordInviteUrl } from "../slackOAuth";
import { getCanonicalOrigin } from "../_core/oauth";
import { sendClaimLinkEmail } from "../_core/email";
import { buildConnectAuthorizeUrl } from "../stripeConnect";
import { deriveOnboardingStatus } from "../onboarding";
import { createRateLimiter } from "../rateLimit";
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

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

// Signup accepts the merchant's logo inline (same reasoning as setTwintQr: the
// merchant has a file, not a URL). SVG is deliberately excluded — a stored SVG
// served from /uploads can carry script, and nothing here sanitizes it.
const LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

// AI palette extraction is a public, pre-signup endpoint that burns LLM
// tokens, so it gets the same soft abuse guard as the public MCP checkout: a
// fixed window per caller IP (shared across instances via the DB store).
// Generous enough for a merchant trying a few logo files; a hostile loop
// hits the wall fast.
const logoPaletteLimiter = createRateLimiter({
  limit: 10,
  windowMs: 60 * 60 * 1000,
});

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

/**
 * Does this account RUN a store — as opposed to merely being attached to one?
 *
 * The distinction is load-bearing: `users.tenantId` is NOT NULL, and every
 * fresh sign-in (Google, Apple, magic link) is parked by `upsertUser` on
 * DEFAULT_TENANT_ID — the platform tenant — with role `customer`. So a truthy
 * tenantId does NOT mean "this account has a store"; for exactly the person
 * signup just told to sign in, it means nothing at all. Guards that treated
 * any tenantId as ownership made claiming a new store impossible in
 * production: the freshly signed-in owner was "already attached" to the
 * platform tenant, the claim CONFLICTed, and `myStore` pointed them at
 * platform.zolto.ch's admin to be refused.
 *
 * Ownership is the ROLE: admins and staff manage the store their tenantId
 * names; a customer row's tenantId is just where they shopped (or the parking
 * default) and must never block a claim nor advertise an admin.
 */
const MANAGING_ROLES = ["superadmin", "admin", "staff"] as const;
function managesAStore(user: {
  tenantId: number | null;
  role: string;
}): boolean {
  return (
    !!user.tenantId && (MANAGING_ROLES as readonly string[]).includes(user.role)
  );
}

/**
 * Shared tail of both claim paths — `claimAdmin` (token from the signup tab)
 * and `resumeClaim` (provider-verified email match, for when that token is
 * gone). Attaches the signed-in account to the pending tenant as admin, burns
 * the single-use pending row, and reports where to go.
 *
 * The different-store guard is the account-level twin of signup's
 * one-email-one-store check (which alone is bypassable by typing a fresh
 * address at signup and then claiming with an already-attached login).
 * Without it, the assignment below would silently rip the account off its
 * first store. It bites only for accounts that MANAGE another store (see
 * managesAStore above) — a customer row is promoted, not refused.
 */
async function finishClaim(
  user: { openId: string; tenantId: number | null; role: string },
  pending: { id: number; tenantId: number },
): Promise<{ tenantId: number; slug: string | null }> {
  if (user.tenantId !== pending.tenantId && managesAStore(user)) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "This account already manages a store. Sign in with a different account to claim this one.",
    });
  }

  await assignUserToTenantAsAdmin(user.openId, pending.tenantId);
  await deleteUserById(pending.id);

  const tenant = await getTenantById(pending.tenantId);
  return { tenantId: pending.tenantId, slug: tenant?.slug ?? null };
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
        // Branding chosen in the signup wizard — all optional so the plain
        // three-field signup keeps working (and so does the mobile app's).
        templateId: z.enum(TEMPLATE_IDS).optional(),
        primaryColor: z.string().regex(HEX_COLOR).optional(),
        secondaryColor: z.string().regex(HEX_COLOR).optional(),
        logo: z
          .object({
            // Base64 image data, with or without a data: prefix. ~3 MB of
            // base64 ≈ 2.2 MB of image — plenty for a logo.
            imageData: z.string().min(1).max(3_000_000),
            mimeType: z.enum(LOGO_MIME_TYPES),
          })
          .optional(),
        // What the merchant sells — picks the category preset and the AI
        // prompt vocabulary. Defaults to jewellery for older signup clients.
        vertical: z.enum(VERTICALS).default("jewellery"),
        verticalDescription: z.string().trim().max(500).optional(),
        // "Already selling somewhere?" — tailors the onboarding checklist's
        // catalogue step toward the matching importer. Optional: a fresh
        // start (and every older signup client) simply omits it.
        migrateFrom: z.enum(MIGRATE_FROM_PROVIDERS).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Slug must be free.
      if (await getTenantBySlug(input.slug)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Store URL already taken",
        });
      }

      // 2. One email, one store. An address already attached to a tenant — as
      // its admin, staff, or a still-unclaimed pending admin — must not spawn
      // a second store; an address that exists with no store (signed in,
      // never created one) is exactly who signup is for and passes.
      //
      // The pending case gets its own message: a merchant whose sign-in failed
      // after signup lands right back here, and "already attached" reads as a
      // dead end when the actual fix is to sign in with this same email and
      // let `resumeClaim` (below) attach the waiting store.
      const existing = await getStoreUserByEmail(input.email);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: existing.pendingClaim
            ? "You already started a signup with this email — your store is created and waiting. Sign in with this same email to finish setting it up."
            : "This email is already attached to a store. Sign in to manage it, or use a different address.",
        });
      }

      // 3. Create the tenant with a 14-day trial. The POS key is stored ONLY
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

      // 4. Settings, seeded with the wizard's branding choices and the
      // vertical's starter category list. The logo is uploaded first so its
      // URL lands in the same insert; a failed upload must not lose the
      // signup, so it degrades to "no logo" (the merchant re-uploads from
      // the admin, and the onboarding checklist keeps the branding task open
      // to say so).
      let logoUrl: string | null = null;
      if (input.logo) {
        try {
          const base64 = input.logo.imageData.replace(
            /^data:[^;]+;base64,/,
            "",
          );
          const buffer = Buffer.from(base64, "base64");
          if (buffer.byteLength > 0) {
            const ext = input.logo.mimeType.split("/")[1] ?? "png";
            // Tenant-scoped so the upload counts against the plan's storage
            // cap like every other image (server/storage.ts).
            const { url } = await storagePut(
              tenantId,
              `logos/${tenantId}/logo.${ext}`,
              buffer,
              input.logo.mimeType,
            );
            logoUrl = url;
          }
        } catch (err) {
          console.warn(
            "[Signup] Logo upload failed; store created without it:",
            err,
          );
        }
      }

      await createTenantSettings({
        tenantId,
        currency: "chf",
        vertical: input.vertical,
        verticalDescription: input.verticalDescription?.trim() || null,
        ...(input.templateId ? { templateId: input.templateId } : {}),
        ...(input.primaryColor ? { primaryColor: input.primaryColor } : {}),
        ...(input.secondaryColor
          ? { secondaryColor: input.secondaryColor }
          : {}),
        ...(logoUrl ? { logoUrl } : {}),
        ...(input.migrateFrom ? { migrateFrom: input.migrateFrom } : {}),
      });
      await seedTenantCategories(tenantId, input.vertical);

      // 5. Stripe customer for future billing (no-op if Stripe isn't configured).
      const stripeCustomerId = await createStripeCustomer({
        name: input.name,
        email: input.email,
      });
      if (stripeCustomerId) {
        await setTenantStripeCustomer(tenantId, stripeCustomerId);
      }

      // 6. Referral: credit the referrer if the code is valid.
      if (input.referralCode) {
        const referrer = await getTenantByReferralCode(input.referralCode);
        if (referrer) await setTenantReferrer(tenantId, referrer.id);
      }

      // 7. Pending admin + one-time claim token (see claimAdmin below).
      // The token is stored as `pending:<token>` in users.openId, which is
      // varchar(64). "pending:" is 8 chars, so the token must be ≤ 56 chars —
      // 24 bytes of hex is 48 chars (192 bits of entropy) and leaves margin.
      const claimToken = crypto.randomBytes(24).toString("hex");
      await createPendingTenantAdmin(tenantId, input.email, claimToken);

      // 8. Email a durable copy of the claim link. The wizard holds the token
      // only in its tab's sessionStorage, so this is what survives a failed
      // sign-in, a closed tab, or switching devices — and it covers the one
      // gap resumeClaim can't: an owner who signs in with a DIFFERENT address
      // than they typed here. Best-effort: a mail failure must not lose the
      // signup (the in-browser token still works, and so does the email-match
      // resume).
      let claimEmailSent = false;
      try {
        const claimUrl =
          `${getCanonicalOrigin(ctx.req)}/onboarding` +
          `?store=${encodeURIComponent(input.slug)}&claim=${claimToken}`;
        claimEmailSent = await sendClaimLinkEmail({
          to: input.email,
          url: claimUrl,
          storeName: input.name,
        });
      } catch (err) {
        console.warn(
          "[Signup] Claim-link email failed; signup continues:",
          err,
        );
      }

      return {
        tenantId,
        slug: input.slug,
        trialEndsAt: trialEndsAt.toISOString(),
        claimToken,
        // Whether the durable claim link actually went out (false when mail
        // isn't configured) — the wizard mentions the email only when true.
        claimEmailSent,
        // Null when no logo was sent OR the upload failed — the wizard tells
        // the merchant to re-upload from the admin in the latter case.
        logoUrl,
        // Shown ONCE — the UI must present it as such ("copy it now; it can't
        // be shown again"). Not stored anywhere in plaintext.
        posApiKey: posApiKeyPlaintext,
      };
    }),

  // ─── Public: AI color scheme from an uploaded logo (signup wizard) ─────────
  // Pre-signup, so there is no tenant or user to hang this on — the wizard
  // calls it while the merchant is still choosing branding, before `create`.
  // Nothing is persisted: it returns a *suggestion* (dominant brand color, an
  // optional secondary, and which of the five templates fits) that the wizard
  // shows for the merchant to accept or override. Rate-limited per IP because
  // it is an unauthenticated endpoint that spends LLM tokens.
  brandingFromLogo: publicProcedure
    .input(
      z.object({
        // Must be a full data URL so the mime type travels with the pixels.
        imageData: z
          .string()
          .regex(
            /^data:image\/(png|jpeg|webp);base64,/,
            "Upload a PNG, JPEG, or WebP logo",
          )
          .max(3_000_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const gate = await logoPaletteLimiter.check(
        `logo-palette:${ctx.req.ip ?? "unknown"}`,
      );
      if (!gate.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Too many color extractions — try again in ${gate.retryAfterSeconds} seconds.`,
        });
      }

      const { invokeLLM } = await import("../_core/llm");
      const templateGuide = STORE_TEMPLATES.map(
        (t) =>
          `- "${t.id}": ${t.tagline}. Best for ${t.bestFor.toLowerCase()}.`,
      ).join("\n");

      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are a brand designer for an e-commerce platform. The user uploads their shop's logo. Extract a TWO-COLOR scheme for their storefront from it.

The storefront uses exactly two brand colors, and they play different roles. Return both.

primaryColor — the STRUCTURAL dark: page header, footer, and primary buttons.
- Pick the logo's dominant brand color: the color a customer would name if asked "what color is this brand?". Ignore white/near-white backgrounds and incidental anti-aliasing colors.
- White text sits on it, so if the logo's brand color is light, return a darker shade of the SAME hue that stays legible as a button color.
- Format: 6-digit hex like #2D6B4A.

secondaryColor — the HIGHLIGHT: dividers, small labels, hover states, price accents.
- Prefer a second color genuinely present in the logo (the gold in a green-and-gold mark, the rust in a navy-and-rust one).
- If the logo is essentially monochrome, choose a harmonious highlight that suits it — an analogous or complementary hue — rather than a tint of the primary.
- It must be clearly DISTINGUISHABLE from primaryColor: never return the same value, and never a color that differs only in lightness. If the only honest answer is "there is no second color", that is what an empty string is for.
- It sits on cream and on the primary, so mid-lightness reads best. Format: 6-digit hex, or "" if genuinely none.

suggestedTemplateId — the storefront template whose mood best matches the logo:
${templateGuide}

rationale: one friendly sentence (max 25 words) naming BOTH colors, e.g. "Deep forest green with a warm gold highlight — a natural fit for the Verdant look."`,
          },
          {
            role: "user",
            content: [
              {
                type: "image_url" as const,
                image_url: { url: input.imageData, detail: "auto" as const },
              },
              {
                type: "text" as const,
                text: "Extract my shop's color scheme from this logo.",
              },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "logo_color_scheme",
            strict: true,
            schema: {
              type: "object",
              properties: {
                primaryColor: { type: "string" },
                secondaryColor: { type: "string" },
                suggestedTemplateId: {
                  type: "string",
                  enum: [...TEMPLATE_IDS],
                },
                rationale: { type: "string" },
              },
              required: [
                "primaryColor",
                "secondaryColor",
                "suggestedTemplateId",
                "rationale",
              ],
              additionalProperties: false,
            },
          },
        },
      });

      const rawContent = response.choices?.[0]?.message?.content;
      if (!rawContent) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "The AI couldn't read that logo. Pick a color manually.",
        });
      }
      let parsed: {
        primaryColor: string;
        secondaryColor: string;
        suggestedTemplateId: string;
        rationale: string;
      };
      try {
        parsed = JSON.parse(
          typeof rawContent === "string"
            ? rawContent
            : JSON.stringify(rawContent),
        );
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "The AI couldn't read that logo. Pick a color manually.",
        });
      }

      // The model is schema-constrained but hex strings still deserve a belt:
      // a malformed color here would flow into updateSettings' validator later
      // and confuse the merchant with an error far from its cause.
      if (!HEX_COLOR.test(parsed.primaryColor)) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "The AI couldn't find a usable color. Pick one manually.",
        });
      }

      // A secondary equal to the primary would render an accent indistinguishable
      // from the ink — dividers and labels vanishing into the footer. Null means
      // "derive a tint from the primary", which is at least visible.
      const secondaryUsable =
        HEX_COLOR.test(parsed.secondaryColor) &&
        parsed.secondaryColor.toLowerCase() !==
          parsed.primaryColor.toLowerCase();

      return {
        primaryColor: parsed.primaryColor,
        secondaryColor: secondaryUsable ? parsed.secondaryColor : null,
        suggestedTemplateId: (TEMPLATE_IDS as readonly string[]).includes(
          parsed.suggestedTemplateId,
        )
          ? (parsed.suggestedTemplateId as (typeof TEMPLATE_IDS)[number])
          : null,
        rationale: parsed.rationale ?? null,
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
      return finishClaim(ctx.user, {
        id: pending.id,
        tenantId: pending.tenantId,
      });
    }),

  // ─── Protected: Is a store waiting for this account's email? ───────────────
  // Read-only companion to resumeClaim below: lets /signin and /onboarding
  // surface "your store is waiting — finish setting it up" instead of a dead
  // end. Null for an account that already manages a store (nothing to resume)
  // or whose email matches no unclaimed signup.
  pendingClaim: protectedProcedure.query(async ({ ctx }) => {
    // managesAStore, not a bare tenantId check: a fresh sign-in is parked on
    // the platform tenant as a customer, and that row is exactly who this
    // lookup exists for.
    if (managesAStore(ctx.user) || !ctx.user.email) return null;
    const pending = await getPendingTenantAdminByEmail(ctx.user.email);
    if (!pending) return null;
    const tenant = await getTenantById(pending.tenantId);
    return tenant ? { slug: tenant.slug, name: tenant.name } : null;
  }),

  // ─── Protected: Resume a claim whose token is gone ──────────────────────────
  // The claim token lives only in the signup tab's sessionStorage, so a failed
  // sign-in, a closed tab, or a second device loses it — and without this
  // procedure that merchant was wedged: signup refuses their email ("already
  // attached"), yet signing in attaches them to nothing. Catch-22, fixable
  // only by an operator.
  //
  // Recovery authorizes by EMAIL instead of token: the signed-in account's
  // email is provider-verified (Google/Apple id token, or a magic link that
  // proved inbox access), and matching it against the address typed at signup
  // is exactly the contract the signup screen promised ("You'll finish setup
  // by signing in with this email"). The pending row still never grants access
  // by itself, and the token path stays for the owner who signs in with a
  // DIFFERENT address than they typed. A stranger typing someone else's email
  // at signup gains nothing here: only the verified owner of the inbox can
  // ever resume it.
  resumeClaim: protectedProcedure.mutation(async ({ ctx }) => {
    const pending = ctx.user.email
      ? await getPendingTenantAdminByEmail(ctx.user.email)
      : undefined;
    if (!pending) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No unclaimed store matches this account's email.",
      });
    }
    return finishClaim(ctx.user, pending);
  }),

  // ─── Protected: Get my tenant ──────────────────────────────────────────────
  /**
   * `plan` is deliberately the **entitled** plan here, not the raw billing
   * column — every admin screen that reads this gates on it (Domain, Support,
   * Billing), and a store the platform owner comped onto Pro pays for Free.
   * Returning the raw column would have shown a comped merchant an upsell for
   * the plan they had just been given, which is the same failure the
   * PLAN_FEATURES note in shared/platform.ts records.
   *
   * What the store actually pays for is still here as `paidPlan`, alongside
   * the rest of `entitlementsFor` — so nothing is hidden, it is just no longer
   * the field a gate reaches for by accident.
   *
   * `compNote` is stripped: it's the operator's own shorthand for why a store
   * was comped, written for the platform console and not for the merchant.
   */
  me: publicProcedure.use(requireTenant).query(async ({ ctx }) => {
    const { compNote: _compNote, ...tenant } = stripPosApiKey(ctx.tenant);
    const entitlements = entitlementsFor(ctx.tenant);
    return { ...tenant, ...entitlements, plan: entitlements.effectivePlan };
  }),

  // ─── Protected: Which store does the signed-in user belong to? ─────────────
  // Host-INDEPENDENT (unlike `me`, which resolves the tenant from the request
  // host): resolves from ctx.user.tenantId, so it works on the marketing
  // surface too. Powers the "go to your store" affordance for a returning
  // merchant who landed on zolto.ch and forgot their store's address. Returns
  // just what a link needs (slug + name), never the POS key; null if the user
  // isn't attached to a store.
  myStore: protectedProcedure.query(async ({ ctx }) => {
    // Role-gated via managesAStore: a customer row's tenantId is where they
    // shopped — or the DEFAULT_TENANT_ID parking spot every fresh sign-in
    // gets — not a store they run. Without the gate, any signed-in visitor
    // grew a "MY STORE" button pointing at the platform tenant's admin,
    // which then refused them.
    if (!managesAStore(ctx.user)) return null;
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

  // Both onboarding mutations write to the tenants row, so they need the same
  // guard as any other store-admin write. They were `publicProcedure` —
  // unauthenticated, like updateSettings above — which let anyone who could
  // reach a store's host dismiss or rewind its onboarding checklist. Low
  // impact next to settings, but the same class of bug and the same fix.
  dismissOnboarding: tenantAdminProcedure.mutation(async ({ ctx }) => {
    await db
      .update(tenants)
      .set({ onboardingStep: -1 })
      .where(eq(tenants.id, ctx.tenant.id));
    return { success: true };
  }),

  setOnboardingCursor: tenantAdminProcedure
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

  // ─── Admin: Custom domain DNS status ──────────────────────────────────────
  // Live check whether the saved custom domain's DNS points at the platform
  // (PLATFORM_DOMAIN env, e.g. app.zolto.ch). Caddy's on-demand TLS only
  // issues a cert once the domain is both registered here and pointing at us.
  //
  // tenantAdminProcedure, matching the updateSettings mutation that writes this
  // domain: as `publicProcedure.use(requireTenant)` it told anyone who could
  // reach a store's host which domain that store had registered and whether it
  // had been set up yet — an infrastructure detail of someone else's business,
  // readable without signing in at all.
  domainStatus: tenantAdminProcedure.query(async ({ ctx }) => {
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
  //
  // SECURITY: this was `publicProcedure.use(requireTenant)` — despite the
  // "Admin" heading it required no authentication at all, so anyone who could
  // reach a store's host could rewrite that store's settings (contact email,
  // Discord intake channel, public domain, branding). Now properly guarded.
  updateSettings: tenantAdminProcedure
    .input(
      z.object({
        logoUrl: z.string().url().optional(),
        primaryColor: z
          .string()
          .regex(/^#[0-9A-Fa-f]{6}$/)
          .optional(),
        secondaryColor: z
          .string()
          .regex(/^#[0-9A-Fa-f]{6}$/)
          .optional(),
        templateId: z.enum(TEMPLATE_IDS).optional(),
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
        // Which Slack channel the intake bot watches (an ID like C0123ABC —
        // an identifier, not a secret; the bot token lives in the vault).
        slackChannelId: z
          .string()
          .regex(
            /^[A-Z][A-Z0-9]{4,20}$/i,
            "A Slack channel ID looks like C0123ABCDEF",
          )
          .optional(),
        // What the merchant sells — drives AI prompt vocabulary and copy.
        // Changing it does NOT touch the existing category list; the admin
        // can pull in the new preset via categories.applyPreset.
        vertical: z.enum(VERTICALS).optional(),
        verticalDescription: z.string().trim().max(500).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const features = featuresForTenant(ctx.tenant);

      if (input.publicDomain !== undefined && !features.customDomain) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "A custom domain requires the Pro plan. Please upgrade.",
        });
      }
      // One domain, one store. The column is unique in the schema, but a bare
      // constraint violation surfaces as a 500 with a MySQL error string; more
      // importantly the domain now decides which store a request is served from
      // (tenantResolve.ts), so two rows claiming it is a tenant mix-up, not a
      // cosmetic clash. Checked here so the merchant gets a sentence they can
      // act on, with the unique index behind it as the actual guarantee.
      if (input.publicDomain !== undefined) {
        const owner = await getTenantSettingsByDomain(input.publicDomain);
        if (owner && owner.tenantId !== ctx.tenant.id) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "That domain is already connected to another store. " +
              "Disconnect it there first, or pick a different subdomain.",
          });
        }
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

  // ─── Admin: "click to connect" URLs for the Channels page ─────────────────
  // Null values hide the corresponding button: the platform simply hasn't
  // registered that app yet. The Slack URL embeds a signed, expiring state
  // naming THIS tenant, so the OAuth callback can't be replayed onto another
  // store; the Discord URL is a plain bot invite (no token changes hands).
  channelConnect: tenantAdminProcedure.query(({ ctx }) => {
    return {
      slackAuthorizeUrl: buildSlackAuthorizeUrl(ctx.tenant.id),
      discordInviteUrl: buildDiscordInviteUrl(),
    };
  }),

  // ─── Admin: Channel credentials (WhatsApp / Slack / Discord) ──────────────
  // Write-only vault contract (server/tenantSecrets.ts): set/rotate/delete and
  // a masked listing. No procedure here — or anywhere — returns the plaintext;
  // the channels read it server-side via channelCredentials.channelSecret().
  channelSecrets: tenantAdminProcedure.query(async ({ ctx }) => {
    const rows = await listTenantSecrets(ctx.tenant.id);
    const known = rows.filter((r) =>
      (CHANNEL_SECRET_PROVIDERS as readonly string[]).includes(r.provider),
    );
    return {
      // Whether the vault can store anything on this deploy (master key set).
      vaultConfigured: isTenantSecretsConfigured(),
      secrets: known.map((r) => ({
        provider: r.provider as ChannelSecretProvider,
        hint: r.hint,
        rotatedAt: r.rotatedAt ?? r.createdAt,
      })),
    };
  }),

  setChannelSecret: tenantAdminProcedure
    .input(
      z.object({
        provider: z.enum(CHANNEL_SECRET_PROVIDERS),
        // Provider tokens vary wildly in shape; length bounds are the only
        // validation that doesn't reject someone's real credential.
        value: z.string().trim().min(8).max(512),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isTenantSecretsConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "This deployment has no tenant-secrets master key configured — ask the platform operator to set TENANT_SECRETS_KEY.",
        });
      }
      await setTenantSecret(ctx.tenant.id, input.provider, input.value);
      // A newly pasted Discord token means a new bot to connect — pick it up
      // now rather than at the next deploy.
      if (input.provider === "discord_bot_token") {
        void startGatewayForToken(input.value.trim());
      }
      return { provider: input.provider, hint: input.value.trim().slice(-4) };
    }),

  deleteChannelSecret: tenantAdminProcedure
    .input(z.object({ provider: z.enum(CHANNEL_SECRET_PROVIDERS) }))
    .mutation(async ({ ctx, input }) => {
      await deleteTenantSecret(ctx.tenant.id, input.provider);
      // A deleted Discord token's gateway stays up until the next restart —
      // acceptable: it can only read channels its own bot was invited to.
      return { provider: input.provider };
    }),

  // ─── Admin: Upload / clear the TWINT QR code sticker ──────────────────────
  // The merchant's own sticker, shown full-screen on the POS for customers to
  // scan (docs/planning/native-twint-integration.md §4b). An upload rather than
  // a pasted URL because TWINT hands merchants an image file, and asking them
  // to self-host it would be absurd. Passing null clears it, which immediately
  // removes the TWINT (QR) option from the POS.
  setTwintQr: tenantAdminProcedure
    .input(
      z.object({
        // Base64 image data (with or without a data: prefix), or null to clear.
        imageData: z.string().max(8_000_000).nullable(),
        mimeType: z
          .enum(["image/png", "image/jpeg", "image/webp"])
          .default("image/png"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let twintQrUrl: string | null = null;

      if (input.imageData !== null) {
        const base64 = input.imageData.replace(/^data:[^;]+;base64,/, "");
        const buffer = Buffer.from(base64, "base64");
        if (buffer.byteLength === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "That file didn't contain any image data.",
          });
        }
        const ext = input.mimeType.split("/")[1] ?? "png";
        // Tenant-scoped so the upload counts against the plan's storage cap
        // like every other image (server/storage.ts).
        const { url } = await storagePut(
          ctx.tenant.id,
          `twint-qr/${ctx.tenant.id}/${Date.now()}.${ext}`,
          buffer,
          input.mimeType,
        );
        twintQrUrl = url;
      }

      const existing = await db.query.tenantSettings.findFirst({
        where: eq(tenantSettings.tenantId, ctx.tenant.id),
      });
      if (existing) {
        await db
          .update(tenantSettings)
          .set({ twintQrUrl, updatedAt: new Date() })
          .where(eq(tenantSettings.id, existing.id));
      } else {
        await db
          .insert(tenantSettings)
          .values({ tenantId: ctx.tenant.id, twintQrUrl });
      }

      return { twintQrUrl };
    }),

  // ─── Admin: Get this tenant's Stripe Connect authorize URL + status ───────
  // Lets a store admin link their OWN Stripe account for storefront checkout
  // (separate from Zolto's own subscription billing — see
  // server/stripeConnect.ts). `url` is null when Connect isn't configured on
  // the platform yet (STRIPE_CONNECT_CLIENT_ID unset).
  // The cross-tenant check that used to be hand-rolled here is now the shared
  // tenantAdminProcedure guard — this was the only copy of it in the codebase,
  // which is precisely why every other admin route was missing it. One
  // behaviour change: a superadmin browsing a tenant subdomain is now allowed
  // through (platform support acting on a store they don't belong to), where
  // the local copy refused. That exemption is deliberate and consistent with
  // platform.metrics being cross-tenant by design.
  getStripeConnectUrl: tenantAdminProcedure.query(async ({ ctx }) => {
    const [tenant, url] = await Promise.all([
      getTenantById(ctx.tenant.id),
      buildConnectAuthorizeUrl(ctx.tenant.id, ctx.req),
    ]);
    return {
      url,
      connected: Boolean(tenant?.stripeConnectedAccountId),
    };
  }),

  // Listing every tenant used to live here as a `publicProcedure` carrying a
  // "TODO: Add superadmin guard" — i.e. unauthenticated enumeration of every
  // store on the platform. It now lives on the platform router as
  // `platform.tenants`, which is superadminProcedure and selects its columns
  // explicitly. Cross-tenant reads belong there by construction; nothing on a
  // tenant-scoped router should ever return another tenant's row.
});
