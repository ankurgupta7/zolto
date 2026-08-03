-- Merchant verticals: what kind of store a tenant runs (jewellery, ceramics,
-- art, vintage, other). Adds the vertical to tenant_settings, converts the
-- global jewellery category enum into a per-tenant category list, and creates
-- the tenant_categories table that backs it. Existing rows are unaffected:
-- enum→varchar preserves the stored strings, and `vertical` defaults to
-- 'jewellery' for every pre-existing store.
CREATE TABLE `tenant_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`key` varchar(64) NOT NULL,
	`label_en` varchar(64) NOT NULL,
	`label_de` varchar(64),
	`extra_includes` json,
	`sort_order` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenant_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenant_categories_tenant_key` UNIQUE(`tenant_id`,`key`)
);
--> statement-breakpoint
ALTER TABLE `products` MODIFY COLUMN `category` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `tenant_settings` ADD `vertical` varchar(32) DEFAULT 'jewellery' NOT NULL;--> statement-breakpoint
ALTER TABLE `tenant_settings` ADD `vertical_description` text;
