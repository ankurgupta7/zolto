import { BRAND } from "@shared/brand";
import { describe, expect, it, vi } from "vitest";
import { createFakeContext, fakeTenant } from "../fakeContext";
import {
  deleteChannelSecret,
  domainStatus,
  editSetting,
  listChannelSecrets,
  onboardingStatus,
  pairRegister,
  rotatePosKey,
  showSettings,
  stripeConnectLink,
} from "./settings";

describe("showSettings", () => {
  it("prints the whole settings row", async () => {
    const { ctx, fake } = createFakeContext({
      caller: {
        tenant: {
          getSettings: async () => ({
            currency: "chf",
            contactEmail: "a@b.ch",
          }),
        },
      },
    });

    await showSettings(ctx);
    expect(fake.text()).toContain("currency: chf");
    expect(fake.text()).toContain("contactEmail: a@b.ch");
  });

  it("says when a store has no settings row at all", async () => {
    const { ctx, fake } = createFakeContext({
      caller: { tenant: { getSettings: async () => null } },
    });

    await showSettings(ctx);
    expect(fake.text()).toContain("no settings row yet");
  });
});

describe("editSetting", () => {
  const getSettings = async () => ({ contactEmail: "old@example.com" });

  it("sends exactly the one field being changed", async () => {
    const updateSettings = vi.fn(async () => ({ success: true }));
    const { ctx } = createFakeContext({
      answers: ["contactEmail", "new@example.com", "y"],
      caller: { tenant: { getSettings, updateSettings } },
    });

    await editSetting(ctx);
    expect(updateSettings).toHaveBeenCalledWith({
      contactEmail: "new@example.com",
    });
  });

  it("shows what each field is set to now", async () => {
    const { ctx, fake } = createFakeContext({
      answers: [""],
      caller: { tenant: { getSettings, updateSettings: vi.fn() } },
    });

    await editSetting(ctx);
    expect(fake.text()).toContain("old@example.com");
  });

  it("writes nothing when the confirmation is declined", async () => {
    const updateSettings = vi.fn();
    const { ctx } = createFakeContext({
      answers: ["currency", "eur", "n"],
      caller: { tenant: { getSettings, updateSettings } },
    });

    await editSetting(ctx);
    expect(updateSettings).not.toHaveBeenCalled();
  });
});

describe("domainStatus", () => {
  it("explains why no certificate is issued when DNS is not pointed here", async () => {
    const { ctx, fake } = createFakeContext({
      caller: {
        tenant: {
          domainStatus: async () => ({
            domain: "shop.example.com",
            expected: `app.${BRAND.domain}`,
            pointsToUs: false,
          }),
        },
      },
    });

    await domainStatus(ctx);
    expect(fake.text()).toContain(`CNAME to app.${BRAND.domain}`);
  });

  it("stays quiet when the domain is set up", async () => {
    const { ctx, fake } = createFakeContext({
      caller: {
        tenant: {
          domainStatus: async () => ({
            domain: "shop.example.com",
            expected: `app.${BRAND.domain}`,
            pointsToUs: true,
          }),
        },
      },
    });

    await domainStatus(ctx);
    expect(fake.text()).not.toContain("will not issue");
  });
});

describe("onboardingStatus", () => {
  it("prints the derived checklist", async () => {
    const { ctx, fake } = createFakeContext({
      caller: {
        tenant: {
          onboardingStatus: async () => ({ step: 2, hasProducts: true }),
        },
      },
    });

    await onboardingStatus(ctx);
    expect(fake.text()).toContain("hasProducts: true");
  });
});

describe("stripeConnectLink", () => {
  it("says when the platform has no Connect client configured", async () => {
    const { ctx, fake } = createFakeContext({
      caller: {
        tenant: {
          getStripeConnectUrl: async () => ({ url: null, connected: false }),
        },
      },
    });

    await stripeConnectLink(ctx);
    expect(fake.text()).toContain("no Stripe Connect client id configured");
  });
});

describe("rotatePosKey", () => {
  it("warns about the registers, then shows the key once", async () => {
    const rotate = vi.fn(async () => ({ posApiKey: "pos_live_new" }));
    const { ctx, fake } = createFakeContext({
      answers: ["y"],
      caller: { tenant: { rotatePosApiKey: rotate } },
    });

    await rotatePosKey(ctx);
    expect(fake.text()).toContain("will stop working until it is re-paired");
    expect(fake.text()).toContain("pos_live_new");
    expect(fake.text()).toContain("stored only as a hash");
  });

  it("rotates nothing without an explicit yes", async () => {
    const rotate = vi.fn();
    const { ctx } = createFakeContext({
      answers: [""],
      caller: { tenant: { rotatePosApiKey: rotate } },
    });

    await rotatePosKey(ctx);
    expect(rotate).not.toHaveBeenCalled();
  });
});

describe("pairRegister", () => {
  it("prints both links and when they expire", async () => {
    const { ctx, fake } = createFakeContext({
      answers: ["y"],
      caller: {
        tenant: {
          createPosPairingToken: async () => ({
            available: true as const,
            deepLink: "gwinn://pair?token=x",
            webLink: `${BRAND.url}/pos-pair?token=x`,
            expiresAt: new Date("2026-03-01T10:05:00Z"),
          }),
        },
      },
    });

    await pairRegister(ctx);
    expect(fake.text()).toContain("gwinn://pair?token=x");
    expect(fake.text()).toContain("Single use");
  });

  it("explains the rotate-first case rather than showing an error", async () => {
    const { ctx, fake } = createFakeContext({
      answers: ["y"],
      caller: {
        tenant: {
          createPosPairingToken: async () => ({
            available: false as const,
            reason: "no stored key",
          }),
        },
      },
    });

    await pairRegister(ctx);
    expect(fake.text()).toContain("Rotate the POS key first");
  });
});

describe("channel credentials", () => {
  const channelSecrets = async () => ({
    vaultConfigured: true,
    secrets: [
      {
        provider: "slack_bot_token" as const,
        hint: "abcd",
        rotatedAt: new Date("2026-02-01T00:00:00Z"),
      },
    ],
  });

  it("lists them masked, and says the vault is write-only", async () => {
    const { ctx, fake } = createFakeContext({
      caller: { tenant: { channelSecrets } },
    });

    await listChannelSecrets(ctx);
    expect(fake.text()).toContain("slack_bot_token");
    expect(fake.text()).toContain("…abcd");
    expect(fake.text()).toContain("write-only");
  });

  it("deletes the chosen credential after warning what breaks", async () => {
    const remove = vi.fn(async () => ({ provider: "slack_bot_token" }));
    const { ctx, fake } = createFakeContext({
      answers: ["1", "y"],
      caller: { tenant: { channelSecrets, deleteChannelSecret: remove } },
    });

    await deleteChannelSecret(ctx);
    expect(remove).toHaveBeenCalledWith({ provider: "slack_bot_token" });
    expect(fake.text()).toContain("That channel stops working");
  });

  it("acts on the store the shell is pointed at", async () => {
    const { ctx, fake } = createFakeContext({
      caller: { tenant: { channelSecrets } },
    });

    await listChannelSecrets(ctx);
    expect(fake.text()).toContain(`Channel credentials — ${fakeTenant.slug}`);
  });
});
