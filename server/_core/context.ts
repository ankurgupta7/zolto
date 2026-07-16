import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { Tenant, User } from "../../drizzle/schema";
import { db } from "../db";
import { tenants } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  tenant: Tenant | null;
};

// Resolve tenant from request:
// 1. X-Tenant-Slug header (for API/POS clients)
// 2. Host header subdomain (tenant.zolto.ch)
// 3. No fallback — if no tenant resolved, context.tenant is null
//    This is intentional: Zolto is a fresh product, not Kalakosh.
//    Kalakosh remains separate on kalakosh.ch.
async function resolveTenant(req: CreateExpressContextOptions["req"]): Promise<Tenant | null> {
  try {
    // Check header first (POS apps, API clients)
    const slug = req.headers["x-tenant-slug"] as string | undefined;
    if (slug) {
      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.slug, slug),
      });
      if (tenant) return tenant;
    }

    // Check subdomain (tenant.zolto.ch)
    const host = req.headers.host || "";
    const subdomain = host.split(".")[0];
    if (subdomain && subdomain !== "www" && subdomain !== "zolto") {
      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.slug, subdomain),
      });
      if (tenant) return tenant;
    }

    // No fallback. Zolto is a separate product.
    return null;
  } catch (_error) {
    return null;
  }
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let tenant: Tenant | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (_error) {
    user = null;
  }

  try {
    tenant = await resolveTenant(opts.req);
  } catch (_error) {
    tenant = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    tenant,
  };
}
