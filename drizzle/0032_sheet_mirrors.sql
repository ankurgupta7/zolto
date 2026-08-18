-- The Google Sheets mirror of a store's sales and inventory (server/sheetMirror.ts).
--
-- One spreadsheet per store, created and owned by the platform service account
-- and shared with the merchant. Everything in the sheet is DERIVED — MySQL stays
-- the ledger, because reserveProducts is a compare-and-set the Sheets API cannot
-- express, a POS sale needs a transaction Sheets cannot roll back, and
-- orders.stripeSessionId's UNIQUE key is what makes a retried webhook idempotent.
--
-- tenant_id is UNIQUE and load-bearing: two rows for one store means two
-- spreadsheets drifting apart, each looking authoritative to whoever opened it.
CREATE TABLE `sheet_mirrors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`spreadsheet_id` varchar(128) NOT NULL,
	`spreadsheet_url` varchar(512) NOT NULL,
	`shared_with` varchar(320) NOT NULL,
	`stock_in_enabled` boolean NOT NULL DEFAULT false,
	`last_synced_at` timestamp NULL,
	`last_sync_error` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sheet_mirrors_id` PRIMARY KEY(`id`),
	CONSTRAINT `sheet_mirrors_tenant_id_unique` UNIQUE(`tenant_id`)
);
