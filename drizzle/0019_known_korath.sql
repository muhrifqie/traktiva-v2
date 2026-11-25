CREATE TABLE `plan_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` integer NOT NULL,
	`video` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`day` text NOT NULL,
	`time` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
