-- Per-tenant storage ledger, backing the "5 GB / 50 GB photo storage" the plan
-- cards sell (shared/platform.ts PLANS[].storageGb). Until now nothing enforced
-- either figure: the only limit was express.json's 50 MB per-request cap, so a
-- free tenant could upload without bound.
--
-- One row per object written through server/storage.ts storagePut. S3 cannot
-- answer "how much does THIS tenant use?" cheaply, so the ledger lives here.
CREATE TABLE IF NOT EXISTS `storage_objects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`storage_key` varchar(512) NOT NULL,
	`bytes` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `storage_objects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
-- The quota read is SUM(bytes) WHERE tenant_id = ?, on every upload.
CREATE INDEX `storage_objects_tenant_idx` ON `storage_objects` (`tenant_id`);
