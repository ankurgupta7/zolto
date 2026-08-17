/**
 * deploy/webhookEvents.test.ts — a webhook endpoint must be subscribed to
 * every event its handler actually acts on.
 *
 * `deploy/rotate-secrets.sh` does not *edit* endpoints, it DELETES the ones
 * pointing at each URL and creates them fresh with a hardcoded event list. So
 * that list, not the Stripe Dashboard, is the real declaration of what each
 * endpoint receives: anything added by hand in the Dashboard is wiped the next
 * time anyone rotates secrets, silently, with the rotation reporting success.
 *
 * The script already says "Keep in step with server/stripe.ts and
 * server/pos.ts". This makes that a test rather than a hope — it went out of
 * step the moment the web till taught `registerPosWebhook` about Checkout
 * Session events while the POS list still read `payment_intent.succeeded`
 * alone.
 *
 * Same shape as `deploy/schemaDrift.test.ts`, for the same reason: the deploy
 * scripts are a second source of truth about production, and drift between
 * them and the code is invisible until a customer is standing at the stall.
 *
 * Only the missing direction is a failure. An endpoint subscribed to an event
 * no branch claims is harmless — the handler acknowledges and ignores it.
 *
 * `/api/stripe/connect-webhook` is deliberately not checked: the script does
 * not register it, because a Connect endpoint is configured once per platform
 * in the Dashboard's Connect settings rather than per deployment.
 */
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");

const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

/**
 * The body of a top-level function, by brace matching. Scoping the event
 * search to one function keeps an unrelated `event.type` comparison elsewhere
 * in the file from being read as a handled event.
 */
function functionBody(src: string, signature: string): string {
  const start = src.indexOf(signature);
  if (start === -1) throw new Error(`no \`${signature}\` in source`);
  const open = src.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open, i);
  }
  throw new Error(`unbalanced braces after \`${signature}\``);
}

/** Event types a handler branches on, whether by `switch` or by `===`. */
function eventsHandledIn(body: string): Set<string> {
  const events = new Set<string>();
  for (const m of body.matchAll(/case "([\w.]+)":/g)) events.add(m[1]);
  for (const m of body.matchAll(/event\.type === "([\w.]+)"/g))
    events.add(m[1]);
  return events;
}

/** url path -> events `rotate-secrets.sh` subscribes it to. */
function eventsSubscribedByScript(): Map<string, Set<string>> {
  const sh = read("deploy/rotate-secrets.sh");
  const subscribed = new Map<string, Set<string>>();
  // rotate_one_webhook "<label>" "<path>" "<ENV_VAR>" \
  //   event.one \
  //   event.two
  for (const m of sh.matchAll(
    /rotate_one_webhook\s+"[^"]*"\s+"([^"]+)"\s+"[^"]+"((?:\s*\\\s*\n\s*[\w.]+)+)/g,
  )) {
    subscribed.set(m[1], new Set(m[2].match(/[\w.]+/g) ?? []));
  }
  return subscribed;
}

const CASES = [
  {
    path: "/api/pos/webhook",
    source: "server/pos.ts",
    fn: "export function registerPosWebhook",
  },
  {
    // Both /api/stripe/webhook and the Connect endpoint dispatch through this
    // one function, so its branches are what the platform endpoint must cover.
    path: "/api/stripe/webhook",
    source: "server/stripe.ts",
    fn: "async function handleStripeEvent",
  },
];

describe("rotate-secrets.sh vs the webhook handlers", () => {
  const subscribed = eventsSubscribedByScript();

  it("parses the script's endpoints and event lists at all", () => {
    // Guards the parsers themselves: a total parse failure would fail the
    // assertions below loudly, but a PARTIAL one would quietly under-report.
    expect([...subscribed.keys()].sort()).toEqual([
      "/api/pos/webhook",
      "/api/stripe/webhook",
    ]);
    expect(subscribed.get("/api/stripe/webhook")).toContain(
      "checkout.session.expired",
    );
  });

  it.each(CASES)("subscribes $path to every event it handles", (cases) => {
    const handled = eventsHandledIn(functionBody(read(cases.source), cases.fn));
    expect(
      handled.size,
      `parsed no handled events out of ${cases.fn} — the parser, not the config, is broken`,
    ).toBeGreaterThan(0);

    const events = subscribed.get(cases.path);
    expect(
      events,
      `rotate-secrets.sh never registers ${cases.path}`,
    ).toBeDefined();

    const missing = [...handled].filter((e) => !events!.has(e));
    expect(
      missing,
      `${cases.path} handles ${missing.join(", ")} but the rotation script ` +
        `does not subscribe to it — a secret rotation would drop the event`,
    ).toEqual([]);
  });
});
