/**
 * AI insights — "plain-language analysis of your catalogue and sales"
 * (marketing promise). Two tiers, matching the plans:
 *  - basic (all plans): computed stats — revenue, units, top sellers, stale stock
 *  - advanced (Studio+): an LLM-written narrative with observations + actions
 * The narrative is grounded in the computed stats only — the model never sees
 * raw rows, just the aggregated summary, and is told not to invent numbers.
 */

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { orders, posOrders, posOrderItems, products } from "../drizzle/schema";
import { getDb } from "./db";
import { invokeLLM } from "./_core/llm";

export interface InsightsSummary {
  currency: string;
  catalog: { total: number; live: number; sold: number; avgPrice: number };
  last30d: {
    onlineOrders: number;
    onlineRevenue: number;
    posSales: number;
    posRevenue: number;
    totalRevenue: number;
    totalUnits: number;
  };
  topSellers: Array<{ name: string; units: number; revenue: number }>;
  staleStock: Array<{ name: string; daysLive: number; price: number }>;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function computeInsights(
  tenantId: number,
  currency: string,
): Promise<InsightsSummary> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const since = new Date(Date.now() - THIRTY_DAYS_MS);

  const catalogRows = await db
    .select({
      total: sql<number>`COUNT(*)`,
      live: sql<number>`SUM(CASE WHEN ${products.sold} = 0 AND ${products.visible} = 1 THEN 1 ELSE 0 END)`,
      soldCount: sql<number>`SUM(CASE WHEN ${products.sold} = 1 THEN 1 ELSE 0 END)`,
      avgPrice: sql<number>`COALESCE(AVG(${products.price}), 0)`,
    })
    .from(products)
    .where(eq(products.tenantId, tenantId));
  const cat = catalogRows[0] ?? {};

  const [online] = await db
    .select({
      count: sql<number>`COUNT(*)`,
      revenue: sql<number>`COALESCE(SUM(${orders.amountTotal}), 0)`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        eq(orders.status, "paid"),
        gte(orders.createdAt, since),
      ),
    );

  const [pos] = await db
    .select({
      count: sql<number>`COUNT(*)`,
      revenue: sql<number>`COALESCE(SUM(${posOrders.totalRappen}), 0)`,
    })
    .from(posOrders)
    .where(
      and(
        eq(posOrders.tenantId, tenantId),
        eq(posOrders.status, "paid"),
        gte(posOrders.createdAt, since),
      ),
    );

  // Top sellers across POS line items (the richer source: every market sale).
  const topRows = await db
    .select({
      name: posOrderItems.name,
      units: sql<number>`COUNT(*)`,
      revenue: sql<number>`COALESCE(SUM(${posOrderItems.priceRappen}), 0)`,
    })
    .from(posOrderItems)
    .innerJoin(posOrders, eq(posOrderItems.posOrderId, posOrders.id))
    .where(
      and(
        eq(posOrderItems.tenantId, tenantId),
        eq(posOrders.status, "paid"),
        gte(posOrders.createdAt, since),
      ),
    )
    .groupBy(posOrderItems.name)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(3);

  // Stale stock: live, unsold, listed for 90+ days.
  const staleRows = await db
    .select({
      name: products.name,
      price: products.price,
      createdAt: products.createdAt,
    })
    .from(products)
    .where(
      and(
        eq(products.tenantId, tenantId),
        eq(products.sold, false),
        eq(products.visible, true),
        sql`${products.createdAt} < DATE_SUB(NOW(), INTERVAL 90 DAY)`,
      ),
    )
    .orderBy(products.createdAt)
    .limit(5);

  const onlineRevenue = Number(online?.revenue ?? 0) / 100;
  const posRevenue = Number(pos?.revenue ?? 0) / 100;

  return {
    currency: (currency || "chf").toUpperCase(),
    catalog: {
      total: Number(cat.total ?? 0),
      live: Number(cat.live ?? 0),
      sold: Number(cat.soldCount ?? 0),
      avgPrice: Number(cat.avgPrice ?? 0),
    },
    last30d: {
      onlineOrders: Number(online?.count ?? 0),
      onlineRevenue,
      posSales: Number(pos?.count ?? 0),
      posRevenue,
      totalRevenue: onlineRevenue + posRevenue,
      totalUnits: Number(online?.count ?? 0) + Number(pos?.count ?? 0),
    },
    topSellers: topRows.map((r) => ({
      name: r.name ?? "Item",
      units: Number(r.units ?? 0),
      revenue: Number(r.revenue ?? 0) / 100,
    })),
    staleStock: staleRows.map((r) => ({
      name: r.name,
      price: Number(r.price),
      daysLive: Math.floor(
        (Date.now() - new Date(r.createdAt).getTime()) / 86_400_000,
      ),
    })),
  };
}

/** Studio+ narrative: 3 observations + 2 concrete actions, grounded in stats. */
export async function generateInsightsNarrative(
  storeName: string,
  summary: InsightsSummary,
): Promise<string> {
  const result = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          `You are a retail analyst for "${storeName}", a small artisan shop. ` +
          "Given the aggregated stats below, write exactly 3 short observations " +
          "and 2 concrete actions, in plain friendly language, no jargon. " +
          "Use only the numbers provided — never invent figures. " +
          "Format: 'Observations' bullet list, then 'Actions' bullet list.",
      },
      {
        role: "user",
        content: `Stats (currency ${summary.currency}):\n${JSON.stringify(summary, null, 2)}`,
      },
    ],
  });
  const raw = result.choices[0]?.message.content;
  const text =
    typeof raw === "string"
      ? raw
      : (raw ?? []).map((c) => ("text" in c ? c.text : "")).join("");
  return text.trim();
}
