CREATE TABLE `student_team_transfers` (
        `id` int AUTO_INCREMENT NOT NULL,
        `studentId` int NOT NULL,
        `fromTeamId` int,
        `toTeamId` int,
        `movedPoints` double NOT NULL DEFAULT 0,
        `date` varchar(10) NOT NULL,
        `createdAt` timestamp NOT NULL DEFAULT (now()),
        CONSTRAINT `student_team_transfers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `activities` MODIFY COLUMN `points` double NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `students` MODIFY COLUMN `totalPoints` double NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `teams` MODIFY COLUMN `totalPoints` double NOT NULL DEFAULT 0;