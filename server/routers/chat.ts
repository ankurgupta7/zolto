/**
 * AI support chat — the storefront assistant promised in marketing ("answers
 * customer questions about materials, shipping, sizing").
 *
 * One procedure: chat.ask. It is catalog-grounded, never generic: the system
 * prompt carries the tenant's live catalog (visible, in-stock products with
 * prices and descriptions) plus the store's contact channels, and instructs
 * the model to answer ONLY from that data and to hand off to a human for
 * anything else. Stateless — the client sends recent history each turn; no
 * chat data is stored (privacy-friendly default).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, requireTenant } from "../_core/trpc";
import { getVisibleProducts, getTenantSettings } from "../db";
import { invokeLLM } from "../_core/llm";

const MAX_HISTORY = 20;
const MAX_MESSAGE = 1000;

/** Cap catalog context so big shops stay within token budget. */
const MAX_CATALOG_ITEMS = 60;

/** Storefront UI languages; the catalog lines follow the visitor's locale. */
const LOCALES = ["de", "en", "fr", "it"] as const;
type Locale = (typeof LOCALES)[number];

type LocalizedRow = {
  name: string;
  description: string;
  nameEn: string | null;
  descriptionEn: string | null;
  nameDe: string | null;
  descriptionDe: string | null;
  nameFr: string | null;
  descriptionFr: string | null;
  nameIt: string | null;
  descriptionIt: string | null;
};

/**
 * Product name/description in the visitor's language, falling back to the
 * primary text — mirrors client/src/lib/localize.ts so the assistant quotes
 * products the way the customer sees them on the page.
 */
function localizedProductText(p: LocalizedRow, locale: Locale) {
  const bySuffix: Record<
    Locale,
    { name: string | null; description: string | null }
  > = {
    en: { name: p.nameEn, description: p.descriptionEn },
    de: { name: p.nameDe, description: p.descriptionDe },
    fr: { name: p.nameFr, description: p.descriptionFr },
    it: { name: p.nameIt, description: p.descriptionIt },
  };
  const t = bySuffix[locale];
  return {
    name: t.name?.trim() || p.name,
    description: t.description?.trim() || p.description,
  };
}

export const chatRouter = router({
  ask: publicProcedure
    .use(requireTenant)
    .input(
      z.object({
        message: z.string().min(1).max(MAX_MESSAGE),
        history: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string().max(MAX_MESSAGE),
            }),
          )
          .max(MAX_HISTORY)
          .default([]),
        // Visitor's storefront UI language; grounds catalog lines in the
        // matching product translations. Optional so older clients keep working.
        locale: z.enum(LOCALES).default("en"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenant = ctx.tenant;
      const [settings, catalog] = await Promise.all([
        getTenantSettings(tenant.id),
        getVisibleProducts(tenant.id),
      ]);

      const inStock = catalog.filter((p) => !p.sold && p.quantity > 0);
      const catalogLines = inStock
        .slice(0, MAX_CATALOG_ITEMS)
        .map((p) => {
          const { name, description } = localizedProductText(p, input.locale);
          return `- ${name} (${Number(p.price).toFixed(2)} ${(
            settings?.currency || "chf"
          ).toUpperCase()}): ${description.slice(0, 200)}`;
        })
        .join("\n");

      const contact = [
        settings?.whatsappNumber && `WhatsApp: ${settings.whatsappNumber}`,
        settings?.contactEmail && `Email: ${settings.contactEmail}`,
      ]
        .filter(Boolean)
        .join(", ");

      const system = [
        `You are the friendly shop assistant for "${tenant.name}", a small artisan store on gwinn.`,
        `Answer customer questions about these products and the store. Ground every answer in the catalog below — never invent products, prices, or policies.`,
        `If asked about availability, note items are one-off pieces (quantity 1) unless stated. If you don't know something (shipping details, custom orders, details beyond what's written), say so and point to the human contact.`,
        `Keep answers short (2–4 sentences). Reply in the language the customer writes in. You may suggest specific products by name with their price.`,
        contact ? `Human contact: ${contact}.` : "",
        catalogLines
          ? `CATALOG:\n${catalogLines}`
          : "CATALOG: (the store currently has no products listed online)",
      ]
        .filter(Boolean)
        .join("\n");

      let reply: string;
      try {
        const result = await invokeLLM({
          messages: [
            { role: "system", content: system },
            ...input.history.map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            })),
            { role: "user", content: input.message },
          ],
        });
        const raw = result.choices[0]?.message.content;
        reply = (
          typeof raw === "string"
            ? raw
            : (raw ?? []).map((c) => ("text" in c ? c.text : "")).join("")
        ).trim();
      } catch (err) {
        console.error("[Chat] LLM call failed:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "The assistant is unavailable right now — please try again in a moment.",
        });
      }

      if (!reply) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "The assistant didn't answer — please try again.",
        });
      }
      return { reply };
    }),
});
