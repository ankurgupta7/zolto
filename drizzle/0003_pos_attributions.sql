CREATE TABLE `pos_attributions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`posOrderId` int NOT NULL,
	`posOrderItemId` int NOT NULL,
	`amountRappen` int NOT NULL,
	`status` enum('pending_review','confirmed','rejected','no_candidates') NOT NULL DEFAULT 'pending_review',
	`candidateProductIds` varchar(512) NOT NULL,
	`chosenProductId` int,
	`confirmationToken` varchar(128) NOT NULL,
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pos_attributions_id` PRIMARY KEY(`id`),
	CONSTRAINT `pos_attributions_posOrderItemId_unique` UNIQUE(`posOrderItemId`),
	CONSTRAINT `pos_attributions_confirmationToken_unique` UNIQUE(`confirmationToken`)
);
