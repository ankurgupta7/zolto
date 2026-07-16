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
