ALTER TABLE `products`
  ADD COLUMN `nameEn` varchar(255) NULL AFTER `description`,
  ADD COLUMN `descriptionEn` text NULL AFTER `nameEn`;
