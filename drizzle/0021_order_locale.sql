-- Which storefront language the customer bought in (de/en/fr/it). Without
-- this the receipt email can only ever guess a language; with it, receipts
-- and any follow-up mail render in the language the customer actually used.
-- Nullable: orders from before capture simply fall back to English.
ALTER TABLE `orders` ADD `locale` varchar(5);
