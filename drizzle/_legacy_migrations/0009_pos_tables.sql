CREATE TABLE IF NOT EXISTS `pos_orders` (
  `id` int AUTO_INCREMENT NOT NULL,
  `stripePaymentIntentId` varchar(255) NOT NULL,
  `status` enum('pending','paid','failed') NOT NULL DEFAULT 'pending',
  `totalRappen` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `pos_orders_id` PRIMARY KEY(`id`),
  CONSTRAINT `pos_orders_stripePaymentIntentId_unique` UNIQUE(`stripePaymentIntentId`)
);

CREATE TABLE IF NOT EXISTS `pos_order_items` (
  `id` int AUTO_INCREMENT NOT NULL,
  `posOrderId` int NOT NULL,
  `productId` int NOT NULL,
  `priceRappen` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `pos_order_items_id` PRIMARY KEY(`id`),
  CONSTRAINT `fk_pos_order` FOREIGN KEY (`posOrderId`) REFERENCES `pos_orders`(`id`)
);
