-- Transition product categories from material-based to body-part-based.
-- Step 1: expand enum to hold both old and new values simultaneously
ALTER TABLE `products` MODIFY COLUMN `category` enum('Silver','Semi-Precious Gems','Pearls','Necklaces','Earrings','Rings','Bracelets','Bangles','Anklets','Brooches','Hair Accessories','Other') NOT NULL;

-- Step 2: re-map old material categories to body-part categories using German/English name keywords.
--         Checks run in priority order; each UPDATE only touches products still in old categories.

-- Earrings: Ohrhänger, Ohrstecker, Ohrringe, Ohrclip / Earring, Stud, Hoop, Chandelier
UPDATE `products` SET `category` = 'Earrings'
WHERE `category` IN ('Silver', 'Semi-Precious Gems', 'Pearls')
  AND (
    `name`   REGEXP 'Ohrh[aä]nger|Ohrstecker|Ohrringe|Ohrring|Ohrclip|Ohrschmuck'
    OR `nameEn` REGEXP 'Earring|Stud|Hoop|Chandelier|Ear Cuff'
  );

-- Anklets: checked before Necklaces because "Knöchelkette" contains "kette"
-- Fussband, Knöchelkette, Payal / Anklet
UPDATE `products` SET `category` = 'Anklets'
WHERE `category` IN ('Silver', 'Semi-Precious Gems', 'Pearls')
  AND (
    `name`   REGEXP 'Fussband|Fu[sß]band|Kn[oö]chelkette|Payal'
    OR `nameEn` REGEXP 'Anklet|Ankle Chain'
  );

-- Necklaces: Halskette, Kollier, Kette, Anhänger, Choker / Necklace, Pendant, Choker, Collar, Lariat
UPDATE `products` SET `category` = 'Necklaces'
WHERE `category` IN ('Silver', 'Semi-Precious Gems', 'Pearls')
  AND (
    `name`   REGEXP 'Halskette|Kollier|Kette|Anh[aä]nger|Choker'
    OR `nameEn` REGEXP 'Necklace|Pendant|Choker|Collar|Lariat'
  );

-- Bangles: Armreif, Armring / Bangle — checked before Bracelets
UPDATE `products` SET `category` = 'Bangles'
WHERE `category` IN ('Silver', 'Semi-Precious Gems', 'Pearls')
  AND (
    `name`   REGEXP 'Armreif|Armring'
    OR `nameEn` REGEXP 'Bangle'
  );

-- Bracelets: Armband / Bracelet, Cuff
UPDATE `products` SET `category` = 'Bracelets'
WHERE `category` IN ('Silver', 'Semi-Precious Gems', 'Pearls')
  AND (
    `name`   REGEXP 'Armband'
    OR `nameEn` REGEXP 'Bracelet|Cuff'
  );

-- Rings: Ring, Fingerring (after Earrings so Ohrring is already handled)
UPDATE `products` SET `category` = 'Rings'
WHERE `category` IN ('Silver', 'Semi-Precious Gems', 'Pearls')
  AND (
    `name`   REGEXP 'Fingerring|\\bRing\\b'
    OR `nameEn` REGEXP '\\bRing\\b'
  );

-- Brooches: Brosche, Anstecknadel / Brooch, Lapel Pin
UPDATE `products` SET `category` = 'Brooches'
WHERE `category` IN ('Silver', 'Semi-Precious Gems', 'Pearls')
  AND (
    `name`   REGEXP 'Brosche|Anstecknadel'
    OR `nameEn` REGEXP 'Brooch|Lapel Pin'
  );

-- Hair Accessories: Haarnadel, Haarschmuck, Haarspange, Tikka / Hair Pin, Tikka, Tiara
UPDATE `products` SET `category` = 'Hair Accessories'
WHERE `category` IN ('Silver', 'Semi-Precious Gems', 'Pearls')
  AND (
    `name`   REGEXP 'Haarnadel|Haarschmuck|Haarspange|Haar|Tikka|Tiara'
    OR `nameEn` REGEXP 'Hair Pin|Hair Comb|Tikka|Tiara|Maang|Juda'
  );

-- Fallback: any remaining old-category products → 'Other'
UPDATE `products` SET `category` = 'Other'
WHERE `category` IN ('Silver', 'Semi-Precious Gems', 'Pearls');

-- Step 3: drop the old values, leaving only the new body-part categories
ALTER TABLE `products` MODIFY COLUMN `category` enum('Necklaces','Earrings','Rings','Bracelets','Bangles','Anklets','Brooches','Hair Accessories','Other') NOT NULL;
