ALTER TABLE `products` ADD `discordMessageId` varchar(64);--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_discordMessageId_unique` UNIQUE(`discordMessageId`);