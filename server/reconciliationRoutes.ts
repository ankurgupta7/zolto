/**
 * Human-facing endpoints behind the one-click links in the Stripe
 * reconciliation review email (see `reconciliation.ts` / `_core/email.ts`).
 *
 * GET renders a confirmation page but never mutates anything — this matters
 * because some email clients and corporate link scanners pre-fetch URLs in
 * emails to check for phishing, which would otherwise trigger the action
 * before the admin ever saw it. Only the POST (submitted via the page's
 * button) actually records a decision.
 */

import type { Express, Request, Response } from "express";
import {
  getProductById,
  getStripeReconciliationByToken,
  rejectStripeReconciliation,
  resolveStripeReconciliationConfirmed,
} from "./db";
import { escapeHtml } from "./_core/email";

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

export function registerReconciliationRoutes(app: Express): void {
  // Shows what the link will do and asks for an explicit confirmation click.
  app.get(
    "/api/reconciliation/confirm",
    async (req: Request, res: Response) => {
      try {
        const token =
          typeof req.query.token === "string" ? req.query.token : "";
        const reconciliation = token
          ? await getStripeReconciliationByToken(token)
          : undefined;

        if (!reconciliation) {
          res
            .status(404)
            .send(
              renderPage(
                "Link not found",
                `<h1 style="font-family:Georgia,serif;font-size:20px">Link not found</h1><p>This confirmation link is invalid.</p>`,
              ),
            );
          return;
        }
        if (reconciliation.status !== "pending_review") {
          res
            .status(410)
            .send(
              renderPage(
                "Already handled",
                `<h1 style="font-family:Georgia,serif;font-size:20px">Already handled</h1><p>This payment has already been reviewed.</p>`,
              ),
            );
          return;
        }

        const candidateIds = parseCandidateIds(
          reconciliation.candidateProductIds,
        );
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

        const amount = (reconciliation.amountRappen / 100).toFixed(2);
        let actionLabel = "mark this payment for manual review";
        if ("index" in choice) {
          const product = await getProductById(
            reconciliation.tenantId,
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
          actionLabel = `assign this payment to <strong>${escapeHtml(product.nameEn ?? product.name)}</strong>`;
        }

        res.send(
          renderPage(
            "Confirm reconciliation",
            `
        <h1 style="font-family:Georgia,serif;font-size:20px">Confirm reconciliation</h1>
        <p>CHF ${amount} — Stripe payment ${escapeHtml(reconciliation.stripePaymentIntentId)}</p>
        <p>Are you sure you want to ${actionLabel}?</p>
        <form method="POST" action="/api/reconciliation/confirm">
          <input type="hidden" name="token" value="${escapeHtml(token)}">
          <input type="hidden" name="choice" value="${escapeHtml(rawChoice)}">
          <button type="submit" style="background:#B8963E;color:#2D2620;border:none;padding:12px 24px;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;cursor:pointer">Confirm</button>
        </form>`,
          ),
        );
      } catch (err) {
        console.error("[Reconciliation] GET confirm error:", err);
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

  // Actually records the admin's decision. Only reachable via the form above.
  app.post(
    "/api/reconciliation/confirm",
    async (req: Request, res: Response) => {
      try {
        const body = req.body as Record<string, unknown>;
        const token = typeof body?.token === "string" ? body.token : "";
        const reconciliation = token
          ? await getStripeReconciliationByToken(token)
          : undefined;

        if (!reconciliation) {
          res
            .status(404)
            .send(
              renderPage(
                "Link not found",
                `<h1 style="font-family:Georgia,serif;font-size:20px">Link not found</h1><p>This confirmation link is invalid.</p>`,
              ),
            );
          return;
        }
        if (reconciliation.status !== "pending_review") {
          res
            .status(410)
            .send(
              renderPage(
                "Already handled",
                `<h1 style="font-family:Georgia,serif;font-size:20px">Already handled</h1><p>This payment has already been reviewed.</p>`,
              ),
            );
          return;
        }

        const candidateIds = parseCandidateIds(
          reconciliation.candidateProductIds,
        );
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
          await rejectStripeReconciliation(reconciliation.id);
          res.send(
            renderPage(
              "Marked for review",
              `<h1 style="font-family:Georgia,serif;font-size:20px">Noted</h1><p>This payment has been marked for manual review. Inventory was not changed.</p>`,
            ),
          );
          return;
        }

        const productId = candidateIds[choice.index];
        const product = await getProductById(
          reconciliation.tenantId,
          productId,
        );
        if (!product || product.sold || product.quantity <= 0) {
          res
            .status(409)
            .send(
              renderPage(
                "No longer available",
                `<h1 style="font-family:Georgia,serif;font-size:20px">No longer available</h1><p>That piece is already marked sold or out of stock. Please reconcile this payment manually.</p>`,
              ),
            );
          return;
        }

        await resolveStripeReconciliationConfirmed(
          reconciliation.id,
          productId,
          reconciliation.amountRappen,
          reconciliation.stripePaymentIntentId,
        );

        const amount = (reconciliation.amountRappen / 100).toFixed(2);
        res.send(
          renderPage(
            "Confirmed",
            `<h1 style="font-family:Georgia,serif;font-size:20px">Done</h1><p>CHF ${amount} has been recorded as a sale of <strong>${escapeHtml(product.nameEn ?? product.name)}</strong>, and inventory has been updated.</p>`,
          ),
        );
      } catch (err) {
        console.error("[Reconciliation] POST confirm error:", err);
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
