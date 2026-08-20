import { BRAND } from "@shared/brand";
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  beforeAll,
  afterAll,
} from "vitest";
import type { Request } from "express";

/**
 * The storefront branch of injectHeadForRequest — the one place that turns a
 * tenant row plus its settings into the "Made with Gwinn" gate, and hands the
 * same answer to BOTH injectors. Its own file because the storefront branch
 * needs a real tenant and a catalogue, where htmlHead.test.ts deliberately
 * mocks the lookups down to "no tenant" for the marketing routes.
 */

const mocks = vi.hoisted(() => ({
  tenant: {} as Record<string, unknown> | null,
  settings: null as Record<string, unknown> | null,
}));

vi.mock("./db", () => ({
  getTenantSettings: vi.fn(async () => mocks.settings),
  getVisibleProducts: vi.fn(async () => []),
  getVisibleProductById: vi.fn(async () => undefined),
}));
vi.mock("./tenantResolve", () => ({
  resolveTenantFromRequest: vi.fn(async () => mocks.tenant),
}));

const { injectHeadForRequest } = await import("./htmlHead");

const SHELL = `<!doctype html><html><head>
<title>Gwinn</title>
<meta name="description" content="old default" />
</head><body><div id="root"></div></body></html>`;

/** A custom domain — the case the credit exists for. */
function fakeReq(url: string, host = "shop.bergblume.ch"): Request {
  return {
    headers: { host },
    originalUrl: url,
    path: "/",
    url: "/",
    protocol: "https",
  } as unknown as Request;
}

let savedBaseUrl: string | undefined;
beforeAll(() => {
  savedBaseUrl = process.env.PUBLIC_BASE_URL;
  process.env.PUBLIC_BASE_URL = BRAND.url;
});
afterAll(() => {
  if (savedBaseUrl === undefined) delete process.env.PUBLIC_BASE_URL;
  else process.env.PUBLIC_BASE_URL = savedBaseUrl;
});

beforeEach(() => {
  mocks.tenant = {
    id: 3,
    slug: "bergblume",
    name: "Bergblume Keramik",
    plan: "free",
  };
  mocks.settings = null;
});

describe("injectHeadForRequest — the credit on a storefront", () => {
  it(`credits ${BRAND.name} on a custom domain, in markup and structured data alike`, async () => {
    // The whole point of this change: a custom domain is Pro-only, so these
    // were exactly the storefronts that named Gwinn nowhere at all.
    mocks.tenant = { ...mocks.tenant, plan: "pro" };
    const out = await injectHeadForRequest(fakeReq("/"), SHELL);

    expect(out).toContain(
      `<meta name="generator" content="${BRAND.name} (${BRAND.url})" />`,
    );
    expect(out).toContain(`<link rel="author" href="${BRAND.url}/"`);
    expect(out).toContain(`${BRAND.url}/#organization`);
    expect(out).toContain(`Bergblume Keramik is made with ${BRAND.name}`);
  });

  it("hands the same answer to the head and the SEO injector", async () => {
    // One gate read once. If these could disagree, a store could end up with a
    // generator tag and no creator node, or the reverse.
    mocks.tenant = { ...mocks.tenant, plan: "pro" };
    mocks.settings = { hidePlatformCredit: true };
    const out = await injectHeadForRequest(fakeReq("/"), SHELL);

    expect(out).not.toContain('name="generator"');
    expect(out).not.toContain('rel="author"');
    expect(out).not.toContain(`${BRAND.domain}/#organization`);
    expect(out).not.toContain(`made with ${BRAND.name}`);
    // The store's own head injection is untouched.
    expect(out).toContain("<title>Bergblume Keramik</title>");
    expect(out).toContain(
      '<meta name="gwinn-tenant-slug" content="bergblume" />',
    );
  });

  it("ignores the switch on a store whose plan cannot white-label", async () => {
    mocks.settings = { hidePlatformCredit: true }; // plan is "free"
    const out = await injectHeadForRequest(fakeReq("/"), SHELL);
    expect(out).toContain('name="generator"');
  });

  it("honours a comped Pro store's opt-out", async () => {
    mocks.tenant = { ...mocks.tenant, plan: "free", compPlan: "pro" };
    mocks.settings = { hidePlatformCredit: true };
    const out = await injectHeadForRequest(fakeReq("/"), SHELL);
    expect(out).not.toContain('name="generator"');
  });

  it("credits routes with no per-route SEO too", async () => {
    // /checkout gets no storefront SEO, but it is still a page of a Gwinn
    // store — the generator tag rides on the head injector for that reason.
    const out = await injectHeadForRequest(fakeReq("/checkout"), SHELL);
    expect(out).toContain('name="generator"');
    expect(out).not.toContain("<noscript>");
  });
});
