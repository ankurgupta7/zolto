CREATE TABLE `instagram_posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`postUrl` varchar(1024) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `instagram_posts_id` PRIMARY KEY(`id`)
);
