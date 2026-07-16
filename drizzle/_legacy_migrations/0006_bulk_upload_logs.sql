CREATE TABLE `bulk_upload_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operation` enum('analyze','create','extra_image') NOT NULL,
	`ref` varchar(512) NOT NULL,
	`errorMessage` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bulk_upload_logs_id` PRIMARY KEY(`id`)
);
