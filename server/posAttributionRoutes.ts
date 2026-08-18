/**
 * Human-facing endpoints behind the one-click links in the POS attribution review
 * email (see `posAttribution.ts` / `_core/email.ts`).
 *
 * Same two-step safety as the Stripe reconciliation routes: GET only renders a
 * confirmation page (so email link-scanners that pre-fetch URLs can't apply a
 * decision), and only the POST — submitted via the page's button — attributes the
 * sale and updates stock.
 */

import type { Express, Request, Response } from "express";
import {
  getPosAttributionByToken,
  getProductById,
  rejectPosAttribution,
  resolvePosAttributionConfirmed,
} from "./db";
import { escapeHtml } from "./_core/email";
import { isReviewTokenExpired } from "./reviewToken";

function renderPage(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:Arial,sans-serif;color:#2D2620">
  <div style="max-width:480px;margin:60px auto;background:#fff;border:1px solid #E0D8CC;padding:32px;text-align:center">
    ${bodyHtml}
  </div>
</body>
</html>`;
}

/**
 * The one page for "this link is no longer any good", covering all three ways
 * that happens: it never existed, it expired, or the sale has already been
 * confirmed (which clears the token outright — see server/db.ts).
 *
 * Deliberately does not say which. Whoever is holding this link may be whoever
 * the mail leaked to, and telling them whether a token was ever real is an
 * oracle they should not have. The merchant loses nothing: the same decision is
 * waiting for them, signed in, on /admin/reconciliation.
 */
function deadLink(): [string, string] {
  return [
    "Link no longer valid",
    `<h1 style="font-family:Georgia,serif;font-size:20px">This link is no longer valid</h1>
     <p>It may have expired, or this sale may already have been confirmed.</p>
     <p style="color:#6B5E52;font-size:13px">Anything still waiting for you is on the Reconciliation page of your admin console, where you can decide it without a link.</p>`,
  ];
}

type Choice = { index: number } | { none: true };

function parseChoice(raw: unknown, candidateCount: number): Choice | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  if (raw === "none") return { none: true };
  if (!/^\d+$/.test(raw)) return null;
  const index = Number.parseInt(raw, 10);
  if (index < 0 || index >= candidateCount) return null;
  return { index };
}

function parseCandidateIds(candidateProductIds: string): number[] {
  return candidateProductIds
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter(Number.isFinite);
}

export function registerPosAttributionRoutes(app: Express): void {
  // Shows what the link will do and asks for an explicit confirmation click.
  app.get(
    "/api/pos-attribution/confirm",
    async (req: Request, res: Response) => {
      try {
        const token =
          typeof req.query.token === "string" ? req.query.token : "";
        const attribution = token
          ? await getPosAttributionByToken(token)
          : undefined;

        if (!attribution) {
          res.status(404).send(renderPage(...deadLink()));
          return;
        }
        // A mailed link is a bearer credential; it stops working after
        // REVIEW_TOKEN_TTL_DAYS, measured from the last time this sale was
        // sent to the merchant (server/reviewToken.ts).
        if (isReviewTokenExpired(attribution)) {
          res.status(410).send(renderPage(...deadLink()));
          return;
        }
        if (attribution.status !== "pending_review") {
          res
            .status(410)
            .send(
              renderPage(
                "Already handled",
                `<h1 style="font-family:Georgia,serif;font-size:20px">Already handled</h1><p>This sale has already been confirmed.</p>`,
              ),
            );
          return;
        }

        const candidateIds = parseCandidateIds(attribution.candidateProductIds);
        const rawChoice =
          typeof req.query.choice === "string" ? req.query.choice : "";
        const choice = parseChoice(rawChoice, candidateIds.length);
        if (!choice) {
          res
            .status(400)
            .send(
              renderPage(
                "Invalid link",
                `<h1 style="font-family:Georgia,serif;font-size:20px">Invalid link</h1><p>This confirmation link is malformed.</p>`,
              ),
            );
          return;
        }

        const amount = (attribution.amountRappen / 100).toFixed(2);
        let actionLabel = "leave this sale for you to sort out manually";
        if ("index" in choice) {
          const product = await getProductById(
            attribution.tenantId,
            candidateIds[choice.index],
          );
          if (!product) {
            res
              .status(404)
              .send(
                renderPage(
                  "Product not found",
                  `<h1 style="font-family:Georgia,serif;font-size:20px">Product not found</h1><p>That candidate piece no longer exists.</p>`,
                ),
              );
            return;
          }
          actionLabel = `record this sale as <strong>${escapeHtml(product.nameEn ?? product.name)}</strong> and mark it sold`;
        }

        res.send(
          renderPage(
            "Confirm sale",
            `
        <h1 style="font-family:Georgia,serif;font-size:20px">Confirm sale</h1>
        <p>CHF ${amount} — in-person sale</p>
        <p>Are you sure you want to ${actionLabel}?</p>
        <form method="POST" action="/api/pos-attribution/confirm">
          <input type="hidden" name="token" value="${escapeHtml(token)}">
          <input type="hidden" name="choice" value="${escapeHtml(rawChoice)}">
          <button type="submit" style="background:#B8963E;color:#2D2620;border:none;padding:12px 24px;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;cursor:pointer">Confirm</button>
        </form>`,
          ),
        );
      } catch (err) {
        console.error("[PosAttribution] GET confirm error:", err);
        res
          .status(500)
          .send(
            renderPage(
              "Error",
              `<h1 style="font-family:Georgia,serif;font-size:20px">Something went wrong</h1>`,
            ),
          );
      }
    },
  );

  // Actually records the decision. Only reachable via the form above.
  app.post(
    "/api/pos-attribution/confirm",
    async (req: Request, res: Response) => {
      try {
        const body = req.body as Record<string, unknown>;
        const token = typeof body?.token === "string" ? body.token : "";
        const attribution = token
          ? await getPosAttributionByToken(token)
          : undefined;

        if (!attribution) {
          res.status(404).send(renderPage(...deadLink()));
          return;
        }
        // A mailed link is a bearer credential; it stops working after
        // REVIEW_TOKEN_TTL_DAYS, measured from the last time this sale was
        // sent to the merchant (server/reviewToken.ts).
        if (isReviewTokenExpired(attribution)) {
          res.status(410).send(renderPage(...deadLink()));
          return;
        }
        if (attribution.status !== "pending_review") {
          res
            .status(410)
            .send(
              renderPage(
                "Already handled",
                `<h1 style="font-family:Georgia,serif;font-size:20px">Already handled</h1><p>This sale has already been confirmed.</p>`,
              ),
            );
          return;
        }

        const candidateIds = parseCandidateIds(attribution.candidateProductIds);
        const choice = parseChoice(body?.choice, candidateIds.length);
        if (!choice) {
          res
            .status(400)
            .send(
              renderPage(
                "Invalid link",
                `<h1 style="font-family:Georgia,serif;font-size:20px">Invalid link</h1><p>This confirmation link is malformed.</p>`,
              ),
            );
          return;
        }

        if ("none" in choice) {
          await rejectPosAttribution(attribution.id);
          res.send(
            renderPage(
              "Left for you",
              `<h1 style="font-family:Georgia,serif;font-size:20px">Noted</h1><p>This sale has been left unattributed for you to sort out. Inventory was not changed.</p>`,
            ),
          );
          return;
        }

        const productId = candidateIds[choice.index];
        const product = await getProductById(attribution.tenantId, productId);
        if (!product || product.sold || product.quantity <= 0) {
          res
            .status(409)
            .send(
              renderPage(
                "No longer available",
                `<h1 style="font-family:Georgia,serif;font-size:20px">No longer available</h1><p>That piece is already marked sold or out of stock. Please attribute this sale manually.</p>`,
              ),
            );
          return;
        }

        await resolvePosAttributionConfirmed(
          attribution.id,
          attribution.posOrderItemId,
          productId,
          attribution.tenantId,
        );

        const amount = (attribution.amountRappen / 100).toFixed(2);
        res.send(
          renderPage(
            "Confirmed",
            `<h1 style="font-family:Georgia,serif;font-size:20px">Done</h1><p>CHF ${amount} has been recorded as a sale of <strong>${escapeHtml(product.nameEn ?? product.name)}</strong>, and inventory has been updated across your store and POS.</p>`,
          ),
        );
      } catch (err) {
        console.error("[PosAttribution] POST confirm error:", err);
        res
          .status(500)
          .send(
            renderPage(
              "Error",
              `<h1 style="font-family:Georgia,serif;font-size:20px">Something went wrong</h1>`,
            ),
          );
      }
    },
  );
}
