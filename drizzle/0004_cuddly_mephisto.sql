CREATE TABLE `subjects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`classId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `subjects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `grades` ADD `subjectId` int;