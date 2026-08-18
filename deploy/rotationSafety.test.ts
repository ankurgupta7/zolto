/**
 * deploy/rotationSafety.test.ts — the two properties of `rotate-secrets.sh`
 * that decide whether a credential rotation can take payments down.
 *
 * `deploy/rotateSecrets.test.sh` covers both behaviourally, by running the real
 * script against a stubbed curl — richer than anything here. But that file
 * lives in `npm run test:deploy-scripts`, which no workflow runs, so a
 * regression in it would reach `main` unobserved. These are the same two
 * properties asserted statically, in a file the `deploy/**` glob in
 * vitest.config.ts picks up, so CI has an opinion too.
 *
 * Same reason as `deploy/schemaDrift.test.ts` and `deploy/webhookEvents.test.ts`:
 * the deploy scripts are production, and nothing else in CI reads them.
 */
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const SCRIPT = readFileSync(
  path.resolve(import.meta.dirname, "rotate-secrets.sh"),
  "utf8",
);

/** The body of a shell function, by brace matching from its `name() {` line. */
function shellFunction(name: string): string {
  const start = SCRIPT.indexOf(`${name}() {`);
  if (start === -1) throw new Error(`no \`${name}\` in rotate-secrets.sh`);
  const open = SCRIPT.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < SCRIPT.length; i++) {
    if (SCRIPT[i] === "{") depth++;
    else if (SCRIPT[i] === "}" && --depth === 0) return SCRIPT.slice(open, i);
  }
  throw new Error(`unbalanced braces in \`${name}\``);
}

describe("stripe-key scopes", () => {
  const permissions = [
    ...SCRIPT.matchAll(/^\s*"([a-z_]+)\|[^|]*\|[^"]*"$/gm),
  ].map((m) => m[1]);

  it("parses the permission table at all", () => {
    expect(permissions.length).toBeGreaterThan(3);
  });

  // The minted key is what the app runs on after the next restart. Omitting a
  // resource does not fail the rotation — it fails later, in front of a
  // customer, on whichever call needed it.
  it.each([
    ["checkout_sessions", "storefront checkout and the till's scan-to-pay QR"],
    ["payment_intents", "Terminal card payments and TWINT"],
    ["terminal", "Tap to Pay connection tokens — server/pos.ts calls these"],
    ["webhook_endpoints", "the script's own stripe-webhooks target"],
    ["customers", "customer records attached to sales"],
    ["coupons", "discount codes at checkout"],
  ])("requests %s (%s)", (resource) => {
    expect(permissions).toContain(resource);
  });

  it("probes the key before writing it to .env", () => {
    const body = shellFunction("rotate_stripe_key");
    const verify = body.indexOf("verify_stripe_key_permissions");
    const adopt = body.indexOf("set_env_var");
    expect(verify, "rotate_stripe_key never verifies the key").toBeGreaterThan(
      -1,
    );
    expect(
      verify < adopt,
      "the key must be probed BEFORE it replaces the working one in .env",
    ).toBe(true);
  });
});

describe("stripe-webhooks ordering", () => {
  // Delete-then-create means every failure mode of the create — a key without
  // webhook_endpoints write, a typo'd PUBLIC_BASE_URL, a dropped connection —
  // leaves the URL with no endpoint at all and the old signing secret already
  // gone from Stripe.
  it("creates the replacement endpoint before deleting the old one", () => {
    const body = shellFunction("rotate_one_webhook");
    const create = body.indexOf(
      'http_json POST "${STRIPE_API}/webhook_endpoints"',
    );
    const remove = body.indexOf(
      'http_json DELETE "${STRIPE_API}/webhook_endpoints/',
    );

    expect(create, "no POST to /webhook_endpoints").toBeGreaterThan(-1);
    expect(remove, "no DELETE of /webhook_endpoints/<id>").toBeGreaterThan(-1);
    expect(
      create < remove,
      "rotate_one_webhook deletes before it creates — a failed create would " +
        "leave the URL with no endpoint at all",
    ).toBe(true);
  });

  it("lists the existing endpoints before creating, so it never deletes the new one", () => {
    const body = shellFunction("rotate_one_webhook");
    const list = body.indexOf("webhook_endpoints?limit=100");
    const create = body.indexOf(
      'http_json POST "${STRIPE_API}/webhook_endpoints"',
    );
    expect(list).toBeGreaterThan(-1);
    expect(
      list < create,
      "the ids to retire must be captured before the replacement exists",
    ).toBe(true);
  });
});
