-- users.role: bring the column up to the four roles the app actually uses.
--
-- The baseline (0000) created enum('user','admin') and nothing ever widened it,
-- while drizzle/schema.ts has declared
--   enum('superadmin','admin','staff','customer') NOT NULL DEFAULT 'customer'
-- since multi-tenancy landed. Any write outside the live pair failed with
-- "ERROR 1265 Data truncated for column 'role'" — which broke staff invites
-- (claimStaffInvite writes 'staff') and platform ownership
-- (deploy/tenant-admin.sh --superadmin). Signup was unaffected only because it
-- never names a role and takes the column default.
--
-- Widen → migrate data → narrow, mirroring 0004/0008 for tenants.plan. The
-- transitional enum is the union of both sets, so no existing row is truncated
-- while the data migration runs.
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','superadmin','staff','customer') NOT NULL DEFAULT 'customer';--> statement-breakpoint
UPDATE `users` SET `role`='customer' WHERE `role`='user';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('superadmin','admin','staff','customer') NOT NULL DEFAULT 'customer';
