-- French and Italian category labels. The storefront's category chips fell
-- back to English for fr/it visitors because tenant_categories only carried
-- label_en/label_de. Nullable like label_de: display falls back to labelEn
-- when a locale label is missing (client/src/hooks/useCategories.ts), so
-- this is additive and safe to deploy ahead of any content existing.
ALTER TABLE `tenant_categories` ADD `label_fr` varchar(64);--> statement-breakpoint
ALTER TABLE `tenant_categories` ADD `label_it` varchar(64);
