ALTER TABLE `pos_orders` MODIFY COLUMN `stripePaymentIntentId` varchar(255);--> statement-breakpoint
ALTER TABLE `pos_orders` ADD `paymentMethod` enum('card','cash','twint') DEFAULT 'card' NOT NULL;