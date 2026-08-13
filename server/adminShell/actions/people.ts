/**
 * Tier — People & access.
 *
 * Two different populations live here and it matters which is which:
 * `platform.setTenantUserRole` is the operator's repair for a store whose
 * owner never became its admin, while the staff procedures are the merchant's
 * own team management, run on their behalf. Platform ownership (superadmin) is
 * grantable from neither — that stays a deliberate act on the server, see
 * deploy/tenant-admin.sh.
 */

import { chooseFrom } from "../choose";
import { heading, orDash, table, timestamp, yesNo } from "../format";
import type { ActionContext } from "../types";
import { confirmWrite, withStore } from "./helpers";

export async function listPeople(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant }) => {
    const detail = await ctx.platform.platform.tenantDetail({
      tenantId: tenant.id,
    });
    ctx.io.printLines(
      heading(`People on ${tenant.slug} (${detail.users.length})`),
    );
    if (detail.users.length === 0) {
      ctx.io.print("  Nobody has signed in to this store yet.");
      return;
    }
    ctx.io.printLines(
      table(detail.users, [
        { label: "id", align: "right", value: (u) => String(u.id) },
        { label: "email", value: (u) => orDash(u.email) },
        { label: "name", value: (u) => orDash(u.name) },
        { label: "role", value: (u) => u.role },
        { label: "sign-in", value: (u) => orDash(u.loginMethod) },
        { label: "pending claim", value: (u) => yesNo(u.pendingClaim) },
        { label: "last seen", value: (u) => timestamp(u.lastSignedIn) },
      ]),
    );
    if (detail.tenant.adminCount === 0) {
      ctx.io.print("");
      ctx.io.print(
        "  ⚠ This store has no admin. Every admin procedure refuses its users, " +
          "which the merchant sees as unrelated failures (a dead “Connect Stripe” button).",
      );
      ctx.io.print("    Fix it with “Set a user's role” below.");
    }
  });
}

/**
 * Grant or revoke a store's own admin rights. Deliberately limited to
 * admin|staff by the procedure itself — this console can hand out a store's
 * keys, never the platform's.
 */
export async function setUserRole(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant }) => {
    const detail = await ctx.platform.platform.tenantDetail({
      tenantId: tenant.id,
    });
    const eligible = detail.users.filter((u) => !u.pendingClaim);
    if (eligible.length === 0) {
      ctx.io.print(
        "  Nobody on this store has actually signed in yet — there is no account to promote. " +
          "The owner must sign in once first.",
      );
      return;
    }

    const user = await chooseFrom(ctx.io, {
      title: `  People on ${tenant.slug}`,
      rows: eligible,
      empty: "Nobody to change.",
      searchable: (u) => [String(u.id), u.email ?? "", u.name ?? ""],
      columns: [
        { label: "id", align: "right", value: (u) => String(u.id) },
        { label: "email", value: (u) => orDash(u.email) },
        { label: "role", value: (u) => u.role },
      ],
    });
    if (!user) return;

    if (user.role === "superadmin") {
      ctx.io.print(
        "  That account is a platform owner. Its role is not editable from here.",
      );
      return;
    }

    const role = await chooseFrom(ctx.io, {
      title: "  New role",
      rows: [
        { id: "admin" as const, label: "admin — full control of this store" },
        { id: "staff" as const, label: "staff — a team seat, no settings" },
      ],
      empty: "",
      searchable: (r) => [r.id],
      columns: [{ label: "role", value: (r) => r.label }],
    });
    if (!role) return;
    if (role.id === user.role) {
      ctx.io.print(`  ${orDash(user.email)} is already ${role.id}.`);
      return;
    }

    if (
      !(await confirmWrite(
        ctx,
        `Make ${orDash(user.email)} a ${role.id} of ${tenant.slug}?`,
      ))
    ) {
      return;
    }
    await ctx.platform.platform.setTenantUserRole({
      tenantId: tenant.id,
      userId: user.id,
      role: role.id,
    });
    ctx.io.print(
      `  ${orDash(user.email)} is now ${role.id} of ${tenant.slug}.`,
    );
  });
}

export async function listTeam(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant, caller }) => {
    const team = await caller.staff.list();
    ctx.io.printLines(
      heading(
        `Team — ${tenant.slug} (${team.seatsUsed}/${team.seatLimit} seats used)`,
      ),
    );
    if (team.staff.length > 0) {
      ctx.io.printLines(
        table(team.staff, [
          { label: "id", align: "right", value: (u) => String(u.id) },
          { label: "email", value: (u) => orDash(u.email) },
          { label: "name", value: (u) => orDash(u.name) },
          { label: "role", value: (u) => u.role },
        ]),
      );
    } else {
      ctx.io.print("  No team members.");
    }

    ctx.io.printLines(
      heading(`Pending invites (${team.pendingInvites.length})`),
    );
    if (team.pendingInvites.length === 0) {
      ctx.io.print("  None.");
      return;
    }
    ctx.io.printLines(
      table(team.pendingInvites, [
        { label: "id", align: "right", value: (i) => String(i.id) },
        { label: "email", value: (i) => i.email },
        { label: "expires", value: (i) => timestamp(i.expiresAt) },
      ]),
    );
  });
}

export async function inviteTeammate(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant, caller }) => {
    const email = await ctx.io.ask("  Email to invite (⏎ to cancel)");
    if (email === "") return;
    if (
      !(await confirmWrite(ctx, `Invite ${email} to ${tenant.slug}'s team?`))
    ) {
      return;
    }
    const invite = await caller.staff.invite({ email });
    ctx.io.print(
      invite.emailed
        ? `  Invited ${email} — the invite email went out.`
        : `  Invited ${email}, but no email was sent (mail isn't configured here).`,
    );
    ctx.io.print(
      `  Claim link (valid ${invite.expiresInDays} days): ${invite.claimUrl}`,
    );
  });
}

export async function revokeInvite(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant, caller }) => {
    const team = await caller.staff.list();
    const invite = await chooseFrom(ctx.io, {
      title: `  Pending invites on ${tenant.slug}`,
      rows: team.pendingInvites,
      empty: "No pending invites — nothing to revoke.",
      searchable: (i) => [String(i.id), i.email],
      columns: [
        { label: "id", align: "right", value: (i) => String(i.id) },
        { label: "email", value: (i) => i.email },
        { label: "expires", value: (i) => timestamp(i.expiresAt) },
      ],
    });
    if (!invite) return;
    if (
      !(await confirmWrite(
        ctx,
        `Revoke the invite for ${invite.email}? (frees the seat)`,
      ))
    ) {
      return;
    }
    await caller.staff.revokeInvite({ inviteId: invite.id });
    ctx.io.print(`  Revoked ${invite.email}'s invite.`);
  });
}

/**
 * Remove a staff member. The procedure refuses admins deliberately — demote
 * them under “Set a user's role” first, which keeps a store from losing its
 * last admin by accident.
 */
export async function removeStaff(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant, caller }) => {
    const team = await caller.staff.list();
    const removable = team.staff.filter((u) => u.role === "staff");
    const member = await chooseFrom(ctx.io, {
      title: `  Staff on ${tenant.slug}`,
      rows: removable,
      empty: "No removable staff (admins are demoted, not removed, here).",
      searchable: (u) => [String(u.id), u.email ?? "", u.name ?? ""],
      columns: [
        { label: "id", align: "right", value: (u) => String(u.id) },
        { label: "email", value: (u) => orDash(u.email) },
        { label: "name", value: (u) => orDash(u.name) },
      ],
    });
    if (!member) return;
    ctx.io.print("  Their login row is deleted — this is not reversible.");
    if (
      !(await confirmWrite(
        ctx,
        `Remove ${orDash(member.email)} from ${tenant.slug}?`,
      ))
    ) {
      return;
    }
    await caller.staff.removeStaff({ userId: member.id });
    ctx.io.print(`  Removed ${orDash(member.email)}.`);
  });
}
