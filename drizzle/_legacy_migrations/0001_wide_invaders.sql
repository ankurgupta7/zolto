CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`price` decimal(10,2) NOT NULL,
	`category` enum('Silver','Semi-Precious Gems','Pearls') NOT NULL,
	`imageKey` varchar(512),
	`imageUrl` varchar(1024),
	`visible` boolean NOT NULL DEFAULT true,
	`source` enum('whatsapp','manual') NOT NULL DEFAULT 'manual',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`)
);
