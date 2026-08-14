import { describe, expect, it, vi } from "vitest";
import { createFakeContext, fakeTenant } from "../fakeContext";
import {
  inviteTeammate,
  listPeople,
  removeStaff,
  revokeInvite,
  setUserRole,
} from "./people";

const users = [
  {
    id: 5,
    email: "owner@example.com",
    name: "Owner",
    role: "staff" as const,
    loginMethod: "google",
    pendingClaim: false,
    lastSignedIn: new Date("2026-03-01T08:00:00Z"),
  },
  {
    id: 6,
    email: "never@example.com",
    name: null,
    role: "admin" as const,
    loginMethod: null,
    pendingClaim: true,
    lastSignedIn: new Date("2026-03-01T08:00:00Z"),
  },
];

function detailWith(adminCount: number) {
  return async () => ({
    tenant: { ...fakeTenant, adminCount, userCount: users.length },
    users,
  });
}

describe("listPeople", () => {
  it("lists everyone, marking accounts that never redeemed their claim", async () => {
    const { ctx, fake } = createFakeContext({
      platform: { platform: { tenantDetail: detailWith(1) } },
    });

    await listPeople(ctx);
    expect(fake.text()).toContain("owner@example.com");
    expect(fake.text()).toContain("never@example.com");
  });

  it("warns loudly about a store with no admin, and names the fix", async () => {
    const { ctx, fake } = createFakeContext({
      platform: { platform: { tenantDetail: detailWith(0) } },
    });

    await listPeople(ctx);
    expect(fake.text()).toContain("This store has no admin");
    expect(fake.text()).toContain("Set a user's role");
  });
});

describe("setUserRole", () => {
  it("promotes a real account to admin", async () => {
    const setTenantUserRole = vi.fn(async () => ({ success: true }));
    const { ctx } = createFakeContext({
      answers: ["5", "admin", "y"],
      platform: {
        platform: { tenantDetail: detailWith(0), setTenantUserRole },
      },
    });

    await setUserRole(ctx);
    expect(setTenantUserRole).toHaveBeenCalledWith({
      tenantId: fakeTenant.id,
      userId: 5,
      role: "admin",
    });
  });

  it("hides placeholder rows — a pending claim is not an account to promote", async () => {
    const { ctx, fake } = createFakeContext({
      answers: [""],
      platform: {
        platform: { tenantDetail: detailWith(0), setTenantUserRole: vi.fn() },
      },
    });

    await setUserRole(ctx);
    expect(fake.text()).not.toContain("never@example.com");
  });

  it("explains the dead end when nobody has actually signed in", async () => {
    const { ctx, fake } = createFakeContext({
      platform: {
        platform: {
          tenantDetail: async () => ({
            tenant: fakeTenant,
            users: [users[1]],
          }),
          setTenantUserRole: vi.fn(),
        },
      },
    });

    await setUserRole(ctx);
    expect(fake.text()).toContain("must sign in once first");
  });

  it("does nothing when the role is already what was asked for", async () => {
    const setTenantUserRole = vi.fn();
    const { ctx, fake } = createFakeContext({
      answers: ["5", "staff"],
      platform: {
        platform: { tenantDetail: detailWith(1), setTenantUserRole },
      },
    });

    await setUserRole(ctx);
    expect(setTenantUserRole).not.toHaveBeenCalled();
    expect(fake.text()).toContain("already staff");
  });
});

describe("inviteTeammate", () => {
  it("invites and prints the claim link, which works even when mail does not", async () => {
    const invite = vi.fn(async () => ({
      emailed: false,
      claimUrl: "https://zolto.ch/claim-staff?token=abc",
      expiresInDays: 7,
    }));
    const { ctx, fake } = createFakeContext({
      answers: ["mate@example.com", "y"],
      caller: { staff: { invite } },
    });

    await inviteTeammate(ctx);
    expect(invite).toHaveBeenCalledWith({ email: "mate@example.com" });
    expect(fake.text()).toContain("no email was sent");
    expect(fake.text()).toContain("claim-staff?token=abc");
  });
});

describe("revokeInvite", () => {
  it("revokes the chosen invite", async () => {
    const revoke = vi.fn(async () => ({ success: true }));
    const { ctx } = createFakeContext({
      answers: ["1", "y"],
      caller: {
        staff: {
          list: async () => ({
            staff: [],
            pendingInvites: [
              { id: 11, email: "mate@example.com", expiresAt: new Date() },
            ],
            seatsUsed: 1,
            seatLimit: 3,
          }),
          revokeInvite: revoke,
        },
      },
    });

    await revokeInvite(ctx);
    expect(revoke).toHaveBeenCalledWith({ inviteId: 11 });
  });
});

describe("removeStaff", () => {
  const list = async () => ({
    staff: [
      { id: 5, name: "Staffer", email: "staff@example.com", role: "staff" },
      { id: 6, name: "Boss", email: "boss@example.com", role: "admin" },
    ],
    pendingInvites: [],
    seatsUsed: 2,
    seatLimit: 3,
  });

  it("removes a staff member after a confirmation", async () => {
    const remove = vi.fn(async () => ({ success: true }));
    const { ctx, fake } = createFakeContext({
      answers: ["1", "y"],
      caller: { staff: { list, removeStaff: remove } },
    });

    await removeStaff(ctx);
    expect(remove).toHaveBeenCalledWith({ userId: 5 });
    expect(fake.text()).toContain("not reversible");
  });

  it("never offers an admin for removal — they are demoted first", async () => {
    const remove = vi.fn();
    const { ctx, fake } = createFakeContext({
      answers: [""],
      caller: { staff: { list, removeStaff: remove } },
    });

    await removeStaff(ctx);
    expect(fake.text()).not.toContain("boss@example.com");
    expect(remove).not.toHaveBeenCalled();
  });
});
