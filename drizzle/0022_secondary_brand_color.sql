-- The second brand color, chosen at signup (manually or extracted from the
-- merchant's logo by AI). primary_color remains the structural dark that drives
-- the ink family; secondary_color drives the accent family, which a one-color
-- derivation could only ever render as a lighter tint of the primary — unable
-- to express the ordinary "one structural color + one unrelated highlight"
-- identity (espresso + gold, navy + rust).
--
-- Null means "derive the accent from primary_color", exactly what every
-- existing store does today, so this is a no-op for them until they pick one.
ALTER TABLE `tenant_settings` ADD COLUMN `secondary_color` varchar(7);
