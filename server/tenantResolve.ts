import type { Request } from "express";
import type { Tenant } from "../drizzle/schema";
import { getTenantBySlug } from "./db";

/**
 * Resolve the tenant for a plain Express request (not tRPC), mirroring the tRPC
 * context resolver (server/_core/context.ts): the `X-Tenant-Slug` header wins,
 * then the host's left-most subdomain. Returns null when no tenant matches — the
 * platform apex (zolto.ch / www) and unknown hosts resolve to null.
 *
 * Used by the SEO/LLM and MCP routes, which run outside the tRPC pipeline.
 */
export async function resolveTenantFromRequest(
  req: Request,
): Promise<Tenant | null> {
  try {
    const headerSlug = req.headers["x-tenant-slug"];
    const slug = Array.isArray(headerSlug) ? headerSlug[0] : headerSlug;
    if (slug) {
      const tenant = await getTenantBySlug(slug);
      if (tenant) return tenant;
    }

    const host = (req.headers.host || "").split(":")[0];
    const subdomain = host.split(".")[0];
    if (subdomain && subdomain !== "www" && subdomain !== "zolto") {
      const tenant = await getTenantBySlug(subdomain);
      if (tenant) return tenant;
    }

    return null;
  } catch {
    return null;
  }
}
