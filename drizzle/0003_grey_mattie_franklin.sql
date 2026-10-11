CREATE TABLE `schools` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(180) NOT NULL,
	`address` varchar(240),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `schools_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `classes` ADD `schoolId` int;