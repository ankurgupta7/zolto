-- Two-tier pricing pivot: free/maker/studio/atelier → free/pro
-- (docs/planning/pricing-pivot-agent-commerce.md). Free keeps the whole
-- commerce engine and carries a 1% platform fee on online/agent orders;
-- Pro (CHF 25/mo) removes the fee and unlocks unmetered AI. All existing
-- paid tenants land on Pro — every old paid tier is a superset-priced
-- ancestor of Pro, so nobody loses features; their Stripe subscriptions
-- keep billing at the grandfathered price until migrated by hand.
-- Same three-step enum remap as 0004: widen, translate, narrow.
ALTER TABLE `tenants` MODIFY COLUMN `plan` enum('free','maker','studio','atelier','pro') NOT NULL DEFAULT 'free';--> statement-breakpoint
UPDATE `tenants` SET `plan` = 'pro' WHERE `plan` IN ('maker','studio','atelier');--> statement-breakpoint
ALTER TABLE `tenants` MODIFY COLUMN `plan` enum('free','pro') NOT NULL DEFAULT 'free';--> statement-breakpoint

-- Channel attribution + skim instrumentation on online orders. In-person
-- sales live in pos_orders, so web/agent/in-person are cleanly separable —
-- the pivot's north-star metric (share of vendors with ≥1 online/agent sale).
ALTER TABLE `orders` ADD COLUMN `channel` enum('web','agent') NOT NULL DEFAULT 'web';--> statement-breakpoint
ALTER TABLE `orders` ADD COLUMN `platform_fee_rappen` int NOT NULL DEFAULT 0;

