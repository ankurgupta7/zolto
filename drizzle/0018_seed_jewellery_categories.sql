-- Backfill: seed every existing tenant with the jewellery preset category
-- rows (shared/verticals.ts VERTICAL_PRESETS.jewellery), matching the
-- previously hard-coded PRODUCT_CATEGORIES list exactly — keys, order, and
-- the Sets folding rules — so existing stores behave identically after the
-- enum→varchar conversion. German labels match the storefront's old
-- categories.* locale strings. Idempotent: skips tenants that already have
-- any category rows.
INSERT INTO `tenant_categories` (`tenant_id`, `key`, `label_en`, `label_de`, `extra_includes`, `sort_order`)
SELECT t.`id`, c.`k`, c.`k`, c.`de`, c.`extra`, c.`ord`
FROM `tenants` t
CROSS JOIN (
	SELECT 'Necklaces' AS `k`, 'Halsketten' AS `de`, JSON_ARRAY('Sets') AS `extra`, 0 AS `ord`
	UNION ALL SELECT 'Earrings', 'Ohrringe', JSON_ARRAY('Sets'), 1
	UNION ALL SELECT 'Sets', 'Sets', NULL, 2
	UNION ALL SELECT 'Rings', 'Ringe', NULL, 3
	UNION ALL SELECT 'Bracelets', 'Armbänder', NULL, 4
	UNION ALL SELECT 'Bangles', 'Armreifen', NULL, 5
	UNION ALL SELECT 'Anklets', 'Fussschmuck', NULL, 6
	UNION ALL SELECT 'Brooches', 'Broschen', NULL, 7
	UNION ALL SELECT 'Hair Accessories', 'Haarschmuck', NULL, 8
	UNION ALL SELECT 'Other', 'Sonstiges', NULL, 9
) c
WHERE NOT EXISTS (
	SELECT 1 FROM `tenant_categories` tc WHERE tc.`tenant_id` = t.`id`
);
