-- Customer trust: Trustpilot, testimonials, and discount codes.
--
-- Three features that all answer the same merchant question — "why should a
-- stranger buy from me?" — and that a store either uses or doesn't. Every
-- column and table below is inert for a store that never opens the new admin
-- pages: no Trustpilot domain means no trust band renders, no testimonial rows
-- means no quotes section, no discount codes means checkout behaves exactly as
-- it did before.

-- ── Trustpilot (tenant_settings) ─────────────────────────────────────────────
-- A business unit is identified by the domain it was registered under
-- ("kalakosh.ch"), which is enough to link a shopper to the store's reviews
-- and to the review form without any API key at all. The live star rating
-- needs the platform's TRUSTPILOT_API_KEY; when that is absent the storefront
-- falls back to the plain link rather than rendering nothing.
--
-- 253 is the maximum length of a DNS name.
ALTER TABLE `tenant_settings` ADD COLUMN `trustpilot_domain` varchar(253);

-- Whether the score is printed on the storefront. Separate from having a
-- profile, because "we collect reviews there" and "our score is good enough to
-- show on the home page" are decisions a merchant makes at different times.
-- Defaults to 1: a store that connects a profile means to show it, and the
-- column is meaningless until a domain exists anyway.
ALTER TABLE `tenant_settings` ADD COLUMN `trustpilot_show_rating` boolean NOT NULL DEFAULT true;

-- ── Testimonials ─────────────────────────────────────────────────────────────
-- What a store's own customers said, typed in by the merchant. `google_id`
-- holds the customer's Google account id when the quote came from a Google
-- review; `author_photo_url` holds a picture they supplied. Neither is
-- required — with neither, the storefront draws the author's initials.
--
-- The unique index is on (tenant_id, google_id) so the same Google reviewer
-- cannot be entered twice by two staff members. MySQL exempts NULL from a
-- unique index, so the many rows with no Google id are unaffected.
CREATE TABLE IF NOT EXISTS `testimonials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`author_name` varchar(120) NOT NULL,
	`author_title` varchar(120),
	`author_photo_url` varchar(1024),
	`google_id` varchar(64),
	`quote` text NOT NULL,
	`rating` int,
	`source` enum('manual','google','trustpilot') NOT NULL DEFAULT 'manual',
	`published` boolean NOT NULL DEFAULT true,
	`sort_order` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `testimonials_id` PRIMARY KEY(`id`),
	CONSTRAINT `testimonials_tenant_google` UNIQUE(`tenant_id`,`google_id`)
);

-- ── Discount codes ───────────────────────────────────────────────────────────
-- `code` is unique WITHIN a tenant, not globally: two shops both running
-- "WELCOME10" is normal, and a global unique index would let whichever store
-- claimed the word first take it from every other store on the platform.
--
-- `redeemed_count` counts confirmed redemptions plus live checkout holds, and
-- is only ever moved by a conditional UPDATE that fails at the limit — a
-- read-then-write check would let two simultaneous checkouts both see the last
-- slot as free.
CREATE TABLE IF NOT EXISTS `discount_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`code` varchar(32) NOT NULL,
	`kind` enum('percent','amount') NOT NULL,
	`value` int NOT NULL,
	`currency` varchar(3),
	`campaign` varchar(64),
	`min_subtotal_rappen` int,
	`max_redemptions` int,
	`redeemed_count` int NOT NULL DEFAULT 0,
	`starts_at` timestamp NULL,
	`expires_at` timestamp NULL,
	`active` boolean NOT NULL DEFAULT true,
	`created_by` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `discount_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `discount_codes_tenant_code` UNIQUE(`tenant_id`,`code`)
);

-- ── Discount redemptions ─────────────────────────────────────────────────────
-- A redemption is written as `held` when a Checkout Session opens and becomes
-- `confirmed` when that session is paid. The hold is what stops a single-use
-- code being spent twice in the minutes between "pay now" and the webhook;
-- `held_until` matches the session's own 30-minute expiry, so an abandoned
-- checkout gives the slot back instead of burning the code forever.
--
-- `stripe_session_id` is unique so a replayed webhook confirms the same row
-- rather than recording a second redemption.
CREATE TABLE IF NOT EXISTS `discount_redemptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`discount_code_id` int NOT NULL,
	`order_id` int,
	`stripe_session_id` varchar(255) NOT NULL,
	`status` enum('held','confirmed','released') NOT NULL DEFAULT 'held',
	`amount_off_rappen` int NOT NULL,
	`currency` varchar(3),
	`customer_email` varchar(320),
	`held_until` timestamp NULL,
	`confirmed_at` timestamp NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `discount_redemptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `discount_redemptions_stripe_session_id_unique` UNIQUE(`stripe_session_id`)
);
