-- One-tap POS register pairing.
--
-- Short-lived, single-use tokens delivered as a deep link (`gwinn://pair?t=…`)
-- so the tenant's POS API key never travels in a URL. Only the SHA-256 of the
-- token is stored, and no key is stored at all — redemption reads the key from
-- the encrypted tenant_secrets vault. See server/posPairing.ts.
--
-- The UNIQUE on `token` is what redeemPosPairingToken's single-row lookup
-- relies on.
CREATE TABLE IF NOT EXISTS `pos_pairing_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`token` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`consumedAt` timestamp NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pos_pairing_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `pos_pairing_tokens_token_unique` UNIQUE(`token`)
);
