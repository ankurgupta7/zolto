import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { Tenant, User } from "../../drizzle/schema";
import { resolveTenantForHost } from "../tenantResolve";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  tenant: Tenant | null;
};

// Resolve tenant from request: X-Tenant-Slug header, then the host — a
// platform subdomain (tenant.gwinn.ch) by slug, any other hostname as a
// registered custom domain (shop.example.com). Unknown hosts resolve to null.
//
// The logic itself lives in server/tenantResolve.ts, shared with the non-tRPC
// routes (SEO, llms.txt, MCP). It used to be duplicated here, and the copies
// drifted: both looked up the host's left-most label as a slug regardless of
// which domain it sat under, so a custom domain never found its own tenant —
// and could find someone else's (`shop.example.com` → the store slugged "shop").
async function resolveTenant(
  req: CreateExpressContextOptions["req"],
): Promise<Tenant | null> {
  try {
    const slug = req.headers["x-tenant-slug"] as string | undefined;
    return await resolveTenantForHost(req.headers.host || "", slug ?? null);
  } catch (_error) {
    return null;
  }
}

export async function createContext(
  opts: CreateExpressContextOptions,
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
