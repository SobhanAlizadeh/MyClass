CREATE TABLE `activities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`title` varchar(180) NOT NULL,
	`description` text,
	`kind` enum('positive','negative','neutral') NOT NULL DEFAULT 'neutral',
	`points` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `attendance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`status` enum('present','absent','late','excused') NOT NULL,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `attendance_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `classes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`grade` varchar(80),
	`schoolYear` varchar(30),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `classes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `grades` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`title` varchar(160) NOT NULL,
	`score` int NOT NULL,
	`maxScore` int NOT NULL DEFAULT 20,
	`date` varchar(10) NOT NULL,
	`note` text,
	CONSTRAINT `grades_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` int AUTO_INCREMENT NOT NULL,
	`classId` int NOT NULL,
	`teamId` int,
	`firstName` varchar(80) NOT NULL,
	`lastName` varchar(100) NOT NULL,
	`studentCode` varchar(40),
	`phone` varchar(30),
	`totalPoints` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `students_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`classId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`color` varchar(30) NOT NULL DEFAULT 'teal',
	`totalPoints` int NOT NULL DEFAULT 0,
	CONSTRAINT `teams_id` PRIMARY KEY(`id`)
);
