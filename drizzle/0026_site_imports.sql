-- The paid one-time switch-in import (shared/platform.ts SITE_IMPORT).
--
-- One row per attempt at lifting a merchant's existing shop across. The status
-- order is the feature's pricing model in miniature: the crawl and extraction
-- happen at `previewed` for free, and payment is only asked for once the
-- merchant has seen what was found. `paid` is written by the Stripe webhook
-- alone, and `applied` marks the rows as actually landed — so a replayed
-- webhook or a double-submit cannot import the same shop twice.
CREATE TABLE IF NOT EXISTS `site_imports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`source_url` varchar(1024) NOT NULL,
	`status` enum('previewed','paid','applied','failed') NOT NULL DEFAULT 'previewed',
	`extraction` json,
	`product_count` int NOT NULL DEFAULT 0,
	`stripe_session_id` varchar(255),
	`amount_cents` int,
	`currency` varchar(3),
	`paid_at` timestamp NULL,
	`applied_at` timestamp NULL,
	`failure_reason` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `site_imports_id` PRIMARY KEY(`id`)
);
