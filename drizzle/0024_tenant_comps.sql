-- Comped stores — what the platform owner gives a tenant for nothing.
--
-- `plan` is what Stripe bills and what Stripe's webhooks write
-- (server/billing.ts). These columns are what the operator granted, kept in
-- separate columns so neither can silently overwrite the other: a late
-- `customer.subscription.deleted` setting plan = 'free' must not revoke a comp,
-- and revoking a comp must not take away a plan the merchant is paying for.
--
-- Every plan gate and the online/agent platform fee read the two together via
-- shared/entitlements.ts (effectivePlan / onlineFeeBpsFor).
--
-- NULL comp_plan + comp_fee_waived = 0 is exactly the behaviour every existing
-- store already has, so this is additive and back-compatible.
ALTER TABLE `tenants` ADD `comp_plan` enum('free','pro') NULL;
ALTER TABLE `tenants` ADD `comp_fee_waived` boolean NOT NULL DEFAULT false;
ALTER TABLE `tenants` ADD `comp_note` varchar(255) NULL;
ALTER TABLE `tenants` ADD `comp_granted_at` timestamp NULL;
ALTER TABLE `tenants` ADD `comp_granted_by` int NULL;
