/**
 * Staff router — team seat management within a plan's seat limit
 * (PLAN_FEATURES.maxStaff: free 1 / pro 3).
 *
 * A seat is occupied by a users row with role admin/staff OR held by a pending
 * invite, so a merchant can't invite more people than their plan allows and
 * then have them all accept.
 *
 * Claim flow: the invite email links to /claim-staff?token=…; a logged-in
 * user calls claimInvite, which moves them onto the tenant as role "staff".
 */

import { BRAND } from "@shared/brand";
import { z } from "zod";
import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import {
  router,
  protectedProcedure,
  tenantAdminProcedure,
  featuresForTenant,
} from "../_core/trpc";
import {
  countTenantStaff,
  createStaffInvite,
  deleteStaffInvite,
  deleteUserById,
  getPendingStaffInvites,
  getStaffInviteByToken,
  getTenantById,
  getTenantStaff,
  joinTenantAsStaff,
  markStaffInviteAccepted,
} from "../db";
import { sendTransactionalEmail, escapeHtml } from "../_core/email";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Store-admin guard. `adminProcedure.use(requireTenant)` alone is NOT enough:
// ctx.tenant comes from the request host, so an admin of store A hitting store
// B's subdomain would pass it and act on B's data. tenantAdminProcedure adds
// the belongs-to-this-tenant check (server/_core/trpc.ts).
const tenantAdmin = tenantAdminProcedure;

async function seatsUsed(tenantId: number): Promise<number> {
  const [staff, pending] = await Promise.all([
    countTenantStaff(tenantId),
    getPendingStaffInvites(tenantId),
  ]);
  return staff + pending.length;
}

export const staffRouter = router({
  /** Team roster: current staff, pending invites, and seat usage vs plan. */
  list: tenantAdmin.query(async ({ ctx }) => {
    const [staff, pending] = await Promise.all([
      getTenantStaff(ctx.tenant.id),
      getPendingStaffInvites(ctx.tenant.id),
    ]);
    const limit = featuresForTenant(ctx.tenant).maxStaff;
    return {
      staff: staff.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
      })),
      pendingInvites: pending.map((i) => ({
        id: i.id,
        email: i.email,
        expiresAt: i.expiresAt,
      })),
      seatsUsed: staff.length + pending.length,
      seatLimit: limit,
    };
  }),

  /** Invite a teammate by email. Holds a seat until accepted or revoked. */
  invite: tenantAdmin
    .input(z.object({ email: z.string().email().max(320) }))
    .mutation(async ({ ctx, input }) => {
      const limit = featuresForTenant(ctx.tenant).maxStaff;
      const used = await seatsUsed(ctx.tenant.id);
      if (used >= limit) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Your plan includes ${limit} staff seat${limit === 1 ? "" : "s"} — all in use. Upgrade for more seats.`,
        });
      }

      const email = input.email.trim().toLowerCase();
      const staff = await getTenantStaff(ctx.tenant.id);
      if (staff.some((u) => u.email?.toLowerCase() === email)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "That person is already on your team.",
        });
      }
      const pending = await getPendingStaffInvites(ctx.tenant.id);
      if (pending.some((i) => i.email.toLowerCase() === email)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An invite is already pending for that email.",
        });
      }

      const token = crypto.randomBytes(24).toString("hex");
      const baseUrl =
        process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") ??
        "http://localhost:3000";
      const claimUrl = `${baseUrl}/claim-staff?token=${token}`;

      await createStaffInvite({
        tenantId: ctx.tenant.id,
        email,
        token,
        invitedByUserId: ctx.user!.id,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      });

      // Best-effort email; if mail isn't configured the owner can copy the link.
      let emailed = false;
      try {
        emailed = await sendTransactionalEmail({
          to: email,
          subject: `${ctx.tenant.name} invited you to their team`,
          html: `<p>${escapeHtml(ctx.tenant.name)} invited you to join their store team on ${BRAND.name}.</p>
<p><a href="${claimUrl}">Accept the invite</a> (valid for 7 days).</p>`,
        });
      } catch (err) {
        console.warn("[Staff] Invite email failed:", err);
      }

      return { emailed, claimUrl, expiresInDays: 7 };
    }),

  /** Revoke a pending invite (frees the held seat). */
  revokeInvite: tenantAdmin
    .input(z.object({ inviteId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await deleteStaffInvite(input.inviteId, ctx.tenant.id);
      return { success: true };
    }),

  /**
   * Remove a staff member. Their login row is deleted (it's a shop identity,
   * not a customer account); the owner can't remove themselves or other admins.
   */
  removeStaff: tenantAdmin
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const staff = await getTenantStaff(ctx.tenant.id);
      const target = staff.find((u) => u.id === input.userId);
      if (!target) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Not a staff member",
        });
      }
      if (target.role !== "staff") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only staff (not admins) can be removed here.",
        });
      }
      await deleteUserById(input.userId);
      return { success: true };
    }),

  /**
   * Accept an invite (logged-in user). Moves the caller onto the invite's
   * tenant as staff. The seat-limit check runs again at claim time, in case
   * seats filled up while the invite was pending.
   */
  claimInvite: protectedProcedure
    .input(z.object({ token: z.string().length(48) }))
    .mutation(async ({ ctx, input }) => {
      const invite = await getStaffInviteByToken(input.token);
      if (!invite || invite.acceptedAt) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This invite is invalid or was already used.",
        });
      }
      if (invite.expiresAt.getTime() < Date.now()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This invite has expired — ask for a new one.",
        });
      }
      if (ctx.user.tenantId === invite.tenantId) {
        // Already on this tenant (e.g. double-click) — just confirm.
        return { tenantId: invite.tenantId, alreadyMember: true };
      }

      // Re-check seats in case the team filled up while the invite was
      // pending: accepting must not push the tenant past its plan's limit.
      const [staffCount, tenant] = await Promise.all([
        countTenantStaff(invite.tenantId),
        getTenantById(invite.tenantId),
      ]);
      const max = featuresForTenant(tenant ?? { plan: "free" }).maxStaff;
      if (staffCount >= max) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "That team's seats are full — ask the owner to upgrade.",
        });
      }

      await joinTenantAsStaff(ctx.user.id, invite.tenantId);
      await markStaffInviteAccepted(invite.id);
      return { tenantId: invite.tenantId, alreadyMember: false };
    }),
});
