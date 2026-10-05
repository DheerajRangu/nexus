CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `signing_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`secret` text NOT NULL
);
