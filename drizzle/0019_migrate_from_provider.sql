-- Where a new merchant sold before Gwinn (signup's "already selling
-- somewhere?"): 'stripe' | 'sumup' | 'worldline' | 'other'; NULL = fresh
-- start. Read by the onboarding checklist to turn "add your first product"
-- into a provider-specific "bring your catalogue" step pointing at the
-- matching importer (server/onboarding.ts, server/providerMigration.ts).
ALTER TABLE `tenant_settings` ADD `migrate_from` varchar(16);
