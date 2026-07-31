-- Shared rate-limit store (server/rateLimit.ts). Replaces the in-process
-- fixed-window Map — see the header comment on that file for why: counters
-- must survive a deploy and be shared across every app instance, or a
-- looping agent can just retry against a different instance to reset its
-- own limit.
CREATE TABLE `rate_limit_windows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`limit_key` varchar(255) NOT NULL,
	`count` int NOT NULL,
	`reset_at` bigint NOT NULL,
	CONSTRAINT `rate_limit_windows_id` PRIMARY KEY(`id`),
	CONSTRAINT `rate_limit_windows_limit_key_unique` UNIQUE(`limit_key`)
);
