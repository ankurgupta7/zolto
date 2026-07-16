ALTER TABLE `pos_order_items` MODIFY COLUMN `productId` int;--> statement-breakpoint
ALTER TABLE `pos_order_items` ADD `name` varchar(255);