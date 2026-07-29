import { describe, it, expect, vi, beforeEach } from "vitest";

const dbMock = vi.hoisted(() => ({
  countTenantStaff: vi.fn(),
  createStaffInvite: vi.fn(),
  deleteStaffInvite: vi.fn(),
  deleteUserById: vi.fn(),
  getPendingStaffInvites: vi.fn(),
  getStaffInviteByToken: vi.fn(),
  getTenantById: vi.fn(),
  getTenantStaff: vi.fn(),
  joinTenantAsStaff: vi.fn(),
  markStaffInviteAccepted: vi.fn(),
}));

const emailMock = vi.hoisted(() => ({
  sendTransactionalEmail: vi.fn(),
}));

vi.mock("../db", () => dbMock);
vi.mock("../_core/email", () => ({
  sendTransactionalEmail: emailMock.sendTransactionalEmail,
  escapeHtml: (s: string) => s,
}));

import { staffRouter } from "./staff";
import type { TrpcContext } from "../_core/context";

const tenant = {
  id: 42,
  slug: "aurora",
  name: "Aurora",
  plan: "pro",
} as never;
const admin = {
  id: 1,
  openId: "google:a",
  role: "admin",
  tenantId: 42,
} as never;

function ctx(user: unknown = admin, t: unknown = tenant): TrpcContext {
  return {
    req: { headers: {} } as never,
    res: {} as never,
    user,
    tenant: t,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.getTenantStaff.mockResolvedValue([
    { id: 1, name: "Owner", email: "o@a.example", role: "admin" },
  ]);
  dbMock.getPendingStaffInvites.mockResolvedValue([]);
  dbMock.countTenantStaff.mockResolvedValue(1);
  emailMock.sendTransactionalEmail.mockResolvedValue(true);
});

describe("staff.list", () => {
  it("returns roster, invites, and seat usage vs the plan", async () => {
    const caller = staffRouter.createCaller(ctx());
    const res = await caller.list();
    expect(res.seatLimit).toBe(3); // pro
    expect(res.seatsUsed).toBe(1);
    expect(res.staff[0].email).toBe("o@a.example");
  });

  it("counts pending invites against seats", async () => {
    dbMock.getPendingStaffInvites.mockResolvedValue([
      { id: 9, email: "x@a.example", expiresAt: new Date() },
    ]);
    const res = await staffRouter.createCaller(ctx()).list();
    expect(res.seatsUsed).toBe(2);
  });
});

describe("staff.invite", () => {
  it("creates an invite and emails the link", async () => {
    const res = await staffRouter
      .createCaller(ctx())
      .invite({ email: "New@Example.com" });
    expect(res.emailed).toBe(true);
    expect(res.claimUrl).toContain("/claim-staff?token=");
    expect(dbMock.createStaffInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 42,
        email: "new@example.com", // normalized
        invitedByUserId: 1,
      }),
    );
  });

  it("refuses when all seats are in use", async () => {
    dbMock.countTenantStaff.mockResolvedValue(2);
    dbMock.getPendingStaffInvites.mockResolvedValue([{ id: 1 }]);
    await expect(
      staffRouter.createCaller(ctx()).invite({ email: "x@a.example" }),
    ).rejects.toThrow(/3 staff seats/);
    expect(dbMock.createStaffInvite).not.toHaveBeenCalled();
  });

  it("free plan (1 seat) can't invite anyone", async () => {
    await expect(
      staffRouter
        .createCaller(ctx(admin, { ...tenant, plan: "free" }))
        .invite({ email: "x@a.example" }),
    ).rejects.toThrow(/1 staff seat/);
  });

  it("rejects duplicate invites for existing staff", async () => {
    await expect(
      staffRouter.createCaller(ctx()).invite({ email: "O@a.example" }),
    ).rejects.toThrow(/already on your team/);
  });

  it("rejects a second pending invite for the same email", async () => {
    dbMock.getPendingStaffInvites.mockResolvedValue([
      { id: 1, email: "x@a.example" },
    ]);
    await expect(
      staffRouter.createCaller(ctx()).invite({ email: "x@a.example" }),
    ).rejects.toThrow(/already pending/);
  });

  it("degrades gracefully when email isn't configured", async () => {
    emailMock.sendTransactionalEmail.mockResolvedValue(false);
    const res = await staffRouter
      .createCaller(ctx())
      .invite({ email: "x@a.example" });
    expect(res.emailed).toBe(false);
    expect(res.claimUrl).toContain("token=");
  });
});

describe("staff.revokeInvite + removeStaff", () => {
  it("revokes a pending invite", async () => {
    await staffRouter.createCaller(ctx()).revokeInvite({ inviteId: 5 });
    expect(dbMock.deleteStaffInvite).toHaveBeenCalledWith(5, 42);
  });

  it("removes a staff member", async () => {
    dbMock.getTenantStaff.mockResolvedValue([
      { id: 1, role: "admin" },
      { id: 2, role: "staff", email: "s@a.example" },
    ]);
    await staffRouter.createCaller(ctx()).removeStaff({ userId: 2 });
    expect(dbMock.deleteUserById).toHaveBeenCalledWith(2);
  });

  it("won't remove admins", async () => {
    await expect(
      staffRouter.createCaller(ctx()).removeStaff({ userId: 1 }),
    ).rejects.toThrow(/Only staff/);
    expect(dbMock.deleteUserById).not.toHaveBeenCalled();
  });
});

describe("staff.claimInvite", () => {
  const invite = {
    id: 7,
    tenantId: 42,
    token: "t".repeat(48),
    expiresAt: new Date(Date.now() + 86400000),
    acceptedAt: null,
  };
  const newUser = { id: 99, openId: "google:n", role: "customer", tenantId: 1 };

  it("moves the caller onto the tenant as staff", async () => {
    dbMock.getStaffInviteByToken.mockResolvedValue(invite);
    dbMock.getTenantById.mockResolvedValue(tenant); // pro, 3 seats
    dbMock.countTenantStaff.mockResolvedValue(2);
    const res = await staffRouter
      .createCaller(ctx(newUser, null))
      .claimInvite({ token: invite.token });
    expect(res).toEqual({ tenantId: 42, alreadyMember: false });
    expect(dbMock.joinTenantAsStaff).toHaveBeenCalledWith(99, 42);
    expect(dbMock.markStaffInviteAccepted).toHaveBeenCalledWith(7);
  });

  it("rejects when the team's seats filled up meanwhile", async () => {
    dbMock.getStaffInviteByToken.mockResolvedValue(invite);
    dbMock.getTenantById.mockResolvedValue(tenant);
    dbMock.countTenantStaff.mockResolvedValue(3); // full
    await expect(
      staffRouter
        .createCaller(ctx(newUser, null))
        .claimInvite({ token: invite.token }),
    ).rejects.toThrow(/seats are full/);
    expect(dbMock.joinTenantAsStaff).not.toHaveBeenCalled();
  });

  it("rejects expired and used invites", async () => {
    dbMock.getStaffInviteByToken.mockResolvedValue({
      ...invite,
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(
      staffRouter
        .createCaller(ctx(newUser, null))
        .claimInvite({ token: invite.token }),
    ).rejects.toThrow(/expired/);

    dbMock.getStaffInviteByToken.mockResolvedValue({
      ...invite,
      acceptedAt: new Date(),
    });
    await expect(
      staffRouter
        .createCaller(ctx(newUser, null))
        .claimInvite({ token: invite.token }),
    ).rejects.toThrow(/invalid or was already used/);
  });

  it("is idempotent for someone already on the tenant", async () => {
    dbMock.getStaffInviteByToken.mockResolvedValue(invite);
    const res = await staffRouter
      .createCaller(ctx({ ...newUser, tenantId: 42 }, null))
      .claimInvite({ token: invite.token });
    expect(res.alreadyMember).toBe(true);
    expect(dbMock.joinTenantAsStaff).not.toHaveBeenCalled();
  });

  it("requires login", async () => {
    await expect(
      staffRouter
        .createCaller(ctx(null, null))
        .claimInvite({ token: invite.token }),
    ).rejects.toThrow();
  });
});
