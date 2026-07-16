CREATE TABLE `bulk_upload_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operation` enum('analyze','create','extra_image') NOT NULL,
	`ref` varchar(512) NOT NULL,
	`errorMessage` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bulk_upload_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `instagram_posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`postUrl` varchar(1024) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `instagram_posts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`stripeSessionId` varchar(255) NOT NULL,
	`stripePaymentIntentId` varchar(255),
	`status` enum('pending','paid','failed','expired') NOT NULL DEFAULT 'pending',
	`customerEmail` varchar(320),
	`customerName` varchar(255),
	`amountTotal` int NOT NULL,
	`currency` varchar(10) NOT NULL DEFAULT 'chf',
	`productIds` varchar(512) NOT NULL,
	`paymentMethod` varchar(32),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_stripeSessionId_unique` UNIQUE(`stripeSessionId`)
);
--> statement-breakpoint
CREATE TABLE `pos_order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`posOrderId` int NOT NULL,
	`productId` int NOT NULL,
	`priceRappen` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pos_order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pos_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`stripePaymentIntentId` varchar(255) NOT NULL,
	`status` enum('pending','paid','failed') NOT NULL DEFAULT 'pending',
	`totalRappen` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pos_orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `pos_orders_stripePaymentIntentId_unique` UNIQUE(`stripePaymentIntentId`)
);
--> statement-breakpoint
CREATE TABLE `product_images` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`imageKey` varchar(512) NOT NULL,
	`imageUrl` varchar(1024) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `product_images_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`nameEn` varchar(255),
	`descriptionEn` text,
	`price` decimal(10,2) NOT NULL,
	`category` enum('Necklaces','Earrings','Sets','Rings','Bracelets','Bangles','Anklets','Brooches','Hair Accessories','Other') NOT NULL,
	`imageKey` varchar(512),
	`imageUrl` varchar(1024),
	`visible` boolean NOT NULL DEFAULT true,
	`sold` boolean NOT NULL DEFAULT false,
	`quantity` int NOT NULL DEFAULT 1,
	`source` enum('whatsapp','manual') NOT NULL DEFAULT 'manual',
	`discordMessageId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_discordMessageId_unique` UNIQUE(`discordMessageId`)
);
--> statement-breakpoint
CREATE TABLE `returns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`productIds` varchar(512) NOT NULL,
	`status` enum('requested','received','refunded','rejected') NOT NULL DEFAULT 'requested',
	`requestedAt` timestamp NOT NULL DEFAULT (now()),
	`receivedAt` timestamp,
	`refundedAt` timestamp,
	`stripeRefundId` varchar(255),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `returns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stripe_reconciliations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`stripePaymentIntentId` varchar(255) NOT NULL,
	`amountRappen` int NOT NULL,
	`currency` varchar(10) NOT NULL DEFAULT 'chf',
	`stripeCreatedAt` timestamp NOT NULL,
	`description` text,
	`paymentMethodType` varchar(32),
	`status` enum('pending_review','confirmed','rejected','no_candidates') NOT NULL DEFAULT 'pending_review',
	`candidateProductIds` varchar(512) NOT NULL,
	`chosenProductId` int,
	`confirmationToken` varchar(128) NOT NULL,
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stripe_reconciliations_id` PRIMARY KEY(`id`),
	CONSTRAINT `stripe_reconciliations_stripePaymentIntentId_unique` UNIQUE(`stripePaymentIntentId`),
	CONSTRAINT `stripe_reconciliations_confirmationToken_unique` UNIQUE(`confirmationToken`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
