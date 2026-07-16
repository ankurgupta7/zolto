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
  CONSTRAINT `returns_pk` PRIMARY KEY(`id`)
);
