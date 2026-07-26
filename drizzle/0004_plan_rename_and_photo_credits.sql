-- Plan vocabulary rename: starter/growth/enterprise → free/maker/studio/atelier,
-- matching the marketing source of truth (shared/platform.ts PLANS).
-- MySQL can't keep values that aren't in the column's enum, so the remap happens
-- in three steps: widen the enum to accept BOTH vocabularies, translate the rows,
-- then narrow it to the new vocabulary only.
--
-- Mapping: starter → free (the signup default), growth → studio, enterprise → atelier.
-- There is no old value that maps to "maker" — no tenant was ever on it, since the
-- old "growth" tier is the small-team one.
ALTER TABLE `tenants` MODIFY COLUMN `plan` enum('starter','growth','enterprise','free','maker','studio','atelier') NOT NULL DEFAULT 'free';--> statement-breakpoint
UPDATE `tenants` SET `plan` = 'free' WHERE `plan` = 'starter';--> statement-breakpoint
UPDATE `tenants` SET `plan` = 'studio' WHERE `plan` = 'growth';--> statement-breakpoint
UPDATE `tenants` SET `plan` = 'atelier' WHERE `plan` = 'enterprise';--> statement-breakpoint
ALTER TABLE `tenants` MODIFY COLUMN `plan` enum('free','maker','studio','atelier') NOT NULL DEFAULT 'free';--> statement-breakpoint

-- AI photo credits metering: append-only ledger, balance = SUM(delta) per tenant.
-- See drizzle/schema.ts photoCreditLedger for the full rationale.
CREATE TABLE `photo_credit_ledger` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`delta` int NOT NULL,
	`kind` enum('monthly_grant','purchase','consumption','manual_adjustment') NOT NULL,
	`ref` varchar(255),
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `photo_credit_ledger_id` PRIMARY KEY(`id`)
);
