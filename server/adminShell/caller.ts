/**
 * How the admin shell talks to the application.
 *
 * It calls the SAME tRPC procedures the web consoles call, through
 * `appRouter.createCaller`, rather than writing to the database directly. That
 * is the whole design decision of this tool and it is worth stating plainly:
 *
 *  - Every guard in server/_core/trpc.ts still runs. The shell is not
 *    privileged because it happens to be on the server; it is privileged
 *    because it acts as a real `superadmin` row, and a deployment with no
 *    superadmin gets no shell (see cli.ts).
 *  - Every operator mutation still writes its `[operator-audit]` line
 *    (server/routers/platform.ts), naming which superadmin did what. A direct
 *    UPDATE would leave no such trace.
 *  - Business rules that live in the procedures — a comped store may not be
 *    sold Pro again, a category with products may not be deleted without a
 *    reassignment — hold here too, for free and without a second copy.
 *
 * The cost is a fabricated request context, which this file keeps honest and
 * in one place.
 */

import type { Tenant, User } from "../../drizzle/schema";
import type { TrpcContext } from "../_core/context";
import { appRouter } from "../routers";

export type AdminCaller = ReturnType<typeof appRouter.createCaller>;

/**
 * A stand-in for the Express request. Only three things are ever read off it
 * by the procedures the shell exposes — the host (to build absolute links for
 * POS pairing and Stripe Connect), the protocol, and the client IP for rate
 * limiting — so those are what it carries, and nothing pretends to be more.
 */
export function operatorRequest(host: string): TrpcContext["req"] {
  const headers: Record<string, string> = { host };
  return {
    headers,
    protocol: "https",
    ip: "127.0.0.1",
    get(name: string) {
      return headers[name.toLowerCase()];
    },
  } as unknown as TrpcContext["req"];
}

/**
 * A response object that refuses to be used.
 *
 * There is no HTTP response to write to from a terminal, and the procedures
 * that touch one (session cookies) are not on the shell's menu. If that ever
 * changes, this throws a sentence explaining why instead of failing somewhere
 * deeper with `undefined is not a function`.
 */
export function operatorResponse(): TrpcContext["res"] {
  return new Proxy(
    {},
    {
      get(_target, property) {
        // Symbols and `then` are how promise resolution and console.log poke
        // at unknown objects; answering "nothing here" keeps those harmless.
        if (typeof property === "symbol") return undefined;
        if (property === "then" || property === "toJSON") return undefined;
        throw new Error(
          `The admin shell has no HTTP response, but something called res.${String(property)}(). ` +
            "That procedure needs a real request — run it from the web console instead.",
        );
      },
    },
  ) as unknown as TrpcContext["res"];
}

/**
 * The host to pretend the request arrived on. `PUBLIC_BASE_URL` is what
 * getCanonicalOrigin (server/_core/oauth.ts) prefers anyway; the per-store
 * fallback matters only on a deployment that hasn't set it, where a pairing
 * link built for the wrong host is a link that doesn't work.
 */
export function hostForTenant(tenant: Tenant | null): string {
  const base = process.env.PUBLIC_BASE_URL?.trim();
  if (base) {
    try {
      return new URL(base).host;
    } catch {
      // fall through — a malformed PUBLIC_BASE_URL is not worth failing over
    }
  }
  const platformDomain = process.env.PLATFORM_DOMAIN?.trim();
  if (tenant && platformDomain) return `${tenant.slug}.${platformDomain}`;
  return platformDomain ?? "localhost:3000";
}

export class NotAnOperatorError extends Error {}

/** The shell may only ever act as the platform owner. */
export function assertOperator(user: User): void {
  if (user.role !== "superadmin") {
    throw new NotAnOperatorError(
      `${user.email ?? `user ${user.id}`} is not a platform owner (role: ${user.role}). ` +
        "Grant it with: bash deploy/tenant-admin.sh --superadmin <email>",
    );
  }
}

/**
 * The context for platform-wide work: the operator, no store.
 *
 * `ctx.tenant` stays null deliberately — a superadmin procedure reads across
 * tenants by design and must not be silently narrowed to whichever store the
 * shell happens to be pointed at.
 */
export function platformContext(operator: User): TrpcContext {
  assertOperator(operator);
  return {
    req: operatorRequest(hostForTenant(null)),
    res: operatorResponse(),
    user: operator,
    tenant: null,
  };
}

/**
 * The context for acting on one store.
 *
 * Two fields carry the store, because the routers are split on which one they
 * read (CLAUDE.md, "Authorization: picking the right tRPC procedure"):
 * `tenantAdminProcedure` handlers read `ctx.tenant`, while the `adminProcedure`
 * ones — products, orders, POS pairing — scope every query through
 * `ctx.user.tenantId`. Setting only one of them would leave half the menu
 * acting on the operator's own store instead of the chosen one.
 *
 * The role stays `superadmin`, which is exactly what makes this legitimate
 * rather than a forged session: tenantAdminProcedure exempts superadmins from
 * its belongs-to-this-tenant check *by design*, so platform support can act on
 * a store it does not belong to. The shell is that support, at a prompt.
 */
export function storeContext(operator: User, tenant: Tenant): TrpcContext {
  assertOperator(operator);
  return {
    req: operatorRequest(hostForTenant(tenant)),
    res: operatorResponse(),
    user: { ...operator, tenantId: tenant.id },
    tenant,
  };
}

export function createCallerFor(
  operator: User,
  tenant: Tenant | null,
): AdminCaller {
  return appRouter.createCaller(
    tenant ? storeContext(operator, tenant) : platformContext(operator),
  );
}
