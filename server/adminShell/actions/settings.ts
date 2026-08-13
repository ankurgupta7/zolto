/**
 * Tier — Store setup: settings, domain, registers and channel credentials.
 *
 * The settings editor offers a curated list of fields rather than every column
 * of tenant_settings. Validation stays where it belongs — the procedure's zod
 * schema and its plan gates — so a bad hex colour or a custom domain on a Free
 * store is refused with the same sentence the web console shows.
 */

import {
  CHANNEL_SECRET_PROVIDERS,
  type ChannelSecretProvider,
} from "../../channelCredentials";
import { chooseFrom } from "../choose";
import {
  describe,
  heading,
  keyValues,
  orDash,
  table,
  timestamp,
  yesNo,
} from "../format";
import type { ActionContext } from "../types";
import { confirmWrite, withStore } from "./helpers";

/**
 * The fields worth editing from a terminal: identity, contact, legal and the
 * two plan-gated ones. Image uploads and the storefront's long-form copy are
 * deliberately absent — they are not a prompt's job.
 */
const EDITABLE_FIELDS = [
  { key: "whiteLabelName", label: "Store display name" },
  { key: "contactEmail", label: "Contact email" },
  { key: "contactPhone", label: "Contact phone" },
  { key: "metaTitle", label: "SEO title" },
  { key: "metaDescription", label: "SEO description" },
  { key: "primaryColor", label: "Primary colour (#rrggbb)" },
  { key: "secondaryColor", label: "Secondary colour (#rrggbb)" },
  { key: "instagramHandle", label: "Instagram handle" },
  { key: "whatsappNumber", label: "WhatsApp number" },
  { key: "discordChannelId", label: "Discord intake channel id" },
  { key: "slackChannelId", label: "Slack intake channel id" },
  { key: "companyLegalName", label: "Legal company name (Impressum)" },
  { key: "companyAddress", label: "Company address (Impressum)" },
  { key: "vatNumber", label: "VAT number" },
  { key: "companyRegistration", label: "Company registration number" },
  { key: "publicDomain", label: "Custom domain (Pro plan)" },
  { key: "currency", label: "Currency, 3 letters (non-CHF needs Pro)" },
  { key: "verticalDescription", label: "What this store sells, in words" },
] as const;

export async function showSettings(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant, caller }) => {
    const settings = await caller.tenant.getSettings({ slug: tenant.slug });
    ctx.io.printLines(heading(`Settings — ${tenant.slug}`));
    if (!settings) {
      ctx.io.print("  This store has no settings row yet.");
      return;
    }
    ctx.io.printLines(describe(settings));
  });
}

export async function editSetting(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant, caller }) => {
    const settings = await caller.tenant.getSettings({ slug: tenant.slug });
    const current = (settings ?? {}) as Record<string, unknown>;

    const field = await chooseFrom(ctx.io, {
      title: `  Settings on ${tenant.slug}`,
      rows: EDITABLE_FIELDS,
      empty: "",
      searchable: (f) => [f.key, f.label],
      columns: [
        { label: "field", value: (f) => f.key },
        { label: "what it is", value: (f) => f.label },
        { label: "now", value: (f) => orDash(current[f.key]) },
      ],
    });
    if (!field) return;

    const value = await ctx.io.ask(
      `  New value for ${field.key} (⏎ to cancel)`,
      { default: "" },
    );
    if (value === "") return;
    if (
      !(await confirmWrite(
        ctx,
        `Set ${field.key} to "${value}" on ${tenant.slug}?`,
      ))
    ) {
      return;
    }
    await caller.tenant.updateSettings({ [field.key]: value });
    ctx.io.print(`  ${field.key} is now "${value}".`);
  });
}

export async function domainStatus(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant, caller }) => {
    const status = await caller.tenant.domainStatus();
    ctx.io.printLines(heading(`Custom domain — ${tenant.slug}`));
    ctx.io.printLines(
      keyValues([
        ["registered domain", orDash(status.domain)],
        ["should point at", orDash(status.expected)],
        ["DNS points at us", yesNo(status.pointsToUs)],
      ]),
    );
    if (status.domain && !status.pointsToUs) {
      ctx.io.print("");
      ctx.io.print(
        `  Until ${status.domain} has a CNAME to ${orDash(status.expected)}, ` +
          "Caddy will not issue a certificate for it.",
      );
    }
  });
}

export async function onboardingStatus(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant, caller }) => {
    const status = await caller.tenant.onboardingStatus();
    ctx.io.printLines(heading(`Onboarding — ${tenant.slug}`));
    ctx.io.printLines(describe(status));
  });
}

export async function stripeConnectLink(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant, caller }) => {
    const connect = await caller.tenant.getStripeConnectUrl();
    ctx.io.printLines(heading(`Stripe Connect — ${tenant.slug}`));
    ctx.io.printLines(
      keyValues([
        ["connected", yesNo(connect.connected)],
        ["onboarding link", orDash(connect.url)],
      ]),
    );
    if (!connect.url) {
      ctx.io.print(
        "  No link: this deployment has no Stripe Connect client id configured.",
      );
    }
  });
}

/**
 * Rotate a store's POS key. Every register that store owns stops working the
 * moment this returns, and the plaintext is shown exactly once.
 */
export async function rotatePosKey(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant, caller }) => {
    ctx.io.print(
      `  Every register paired to ${tenant.slug} will stop working until it is re-paired.`,
    );
    if (
      !(await confirmWrite(ctx, `Rotate ${tenant.slug}'s POS API key now?`))
    ) {
      return;
    }
    const { posApiKey } = await caller.tenant.rotatePosApiKey();
    ctx.io.printLines(heading("New POS API key — shown once"));
    ctx.io.print(`  ${posApiKey}`);
    ctx.io.print("");
    ctx.io.print("  Copy it now. It is stored only as a hash.");
  });
}

/** Mint a one-tap pairing link so a register can be set up without retyping. */
export async function pairRegister(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant, caller }) => {
    if (
      !(await confirmWrite(
        ctx,
        `Mint a register pairing link for ${tenant.slug}?`,
      ))
    ) {
      return;
    }
    const result = await caller.tenant.createPosPairingToken();
    if (!result.available) {
      ctx.io.print(
        `  Cannot pair by link: ${result.reason}. Rotate the POS key first, then try again.`,
      );
      return;
    }
    ctx.io.printLines(heading(`Pairing link — ${tenant.slug}`));
    ctx.io.printLines(
      keyValues([
        ["deep link", result.deepLink],
        ["web link", result.webLink],
        ["expires", timestamp(result.expiresAt)],
      ]),
    );
    ctx.io.print("");
    ctx.io.print("  Single use, and it expires in minutes.");
  });
}

export async function listChannelSecrets(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant, caller }) => {
    const vault = await caller.tenant.channelSecrets();
    ctx.io.printLines(heading(`Channel credentials — ${tenant.slug}`));
    ctx.io.print(
      `  Vault configured on this deploy: ${yesNo(vault.vaultConfigured)}`,
    );
    if (vault.secrets.length === 0) {
      ctx.io.print("  Nothing stored for this store.");
      return;
    }
    ctx.io.printLines(
      table(vault.secrets, [
        { label: "provider", value: (s) => s.provider },
        { label: "hint", value: (s) => `…${orDash(s.hint)}` },
        { label: "rotated", value: (s) => timestamp(s.rotatedAt) },
      ]),
    );
    ctx.io.print("");
    ctx.io.print("  Values are write-only — nothing here can read them back.");
  });
}

export async function setChannelSecret(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant, caller }) => {
    const provider = await chooseFrom(ctx.io, {
      title: "  Which credential?",
      rows: CHANNEL_SECRET_PROVIDERS.map((provider) => ({
        id: provider as ChannelSecretProvider,
      })),
      empty: "",
      searchable: (p) => [p.id],
      columns: [{ label: "provider", value: (p) => p.id }],
    });
    if (!provider) return;

    const value = await ctx.io.ask("  Paste the token (⏎ to cancel)");
    if (value === "") return;
    ctx.io.print(
      `  It will be stored encrypted; only the last 4 characters (…${value.slice(-4)}) stay readable.`,
    );
    if (
      !(await confirmWrite(
        ctx,
        `Store a new ${provider.id} for ${tenant.slug}?`,
      ))
    ) {
      return;
    }
    const saved = await caller.tenant.setChannelSecret({
      provider: provider.id,
      value,
    });
    ctx.io.print(`  Stored ${saved.provider} (…${saved.hint}).`);
  });
}

export async function deleteChannelSecret(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant, caller }) => {
    const vault = await caller.tenant.channelSecrets();
    const secret = await chooseFrom(ctx.io, {
      title: `  Stored credentials for ${tenant.slug}`,
      rows: vault.secrets,
      empty: "Nothing stored for this store.",
      searchable: (s) => [s.provider],
      columns: [
        { label: "provider", value: (s) => s.provider },
        { label: "hint", value: (s) => `…${orDash(s.hint)}` },
      ],
    });
    if (!secret) return;
    if (
      !(await confirmWrite(
        ctx,
        `Delete ${tenant.slug}'s ${secret.provider}? That channel stops working.`,
      ))
    ) {
      return;
    }
    await caller.tenant.deleteChannelSecret({ provider: secret.provider });
    ctx.io.print(`  Deleted ${secret.provider}.`);
  });
}
