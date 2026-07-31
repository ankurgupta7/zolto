-- TWINT QR-sticker rail for the POS (docs/planning/native-twint-integration.md
-- §4b). The merchant uploads the QR code sticker TWINT issued them; the POS
-- displays it for the customer to scan, so the payment goes merchant → merchant
-- at TWINT's 1.3% with Stripe out of the in-person loop entirely.
--
-- `twint_qr` is deliberately a separate payment method from `twint`. Stripe
-- TWINT is gateway-confirmed (a PaymentIntent succeeded); a scanned sticker is
-- merchant-attested, exactly like cash — TWINT exposes no API for us to verify
-- it. Collapsing the two would make a claim indistinguishable from proof and
-- quietly poison reconciliation.
ALTER TABLE `pos_orders` MODIFY COLUMN `paymentMethod` enum('card','cash','twint','twint_qr') NOT NULL DEFAULT 'card';--> statement-breakpoint
ALTER TABLE `tenant_settings` ADD COLUMN `twint_qr_url` varchar(1024);
