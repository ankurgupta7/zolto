CREATE TABLE IF NOT EXISTS `stripe_reconciliations` (
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
