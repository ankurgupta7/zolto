-- Italian product locale. Switzerland has four national languages and Zolto
-- targets Swiss market vendors, so a Ticino-facing storefront needs Italian
-- alongside DE/FR/EN. Nullable like the other locales: the storefront falls
-- back to the merchant's primary text whenever a locale is missing
-- (client/src/lib/localize.ts), so this is additive and safe to deploy ahead
-- of any content existing.
ALTER TABLE `products` ADD COLUMN `nameIt` varchar(255);--> statement-breakpoint
ALTER TABLE `products` ADD COLUMN `descriptionIt` text;
