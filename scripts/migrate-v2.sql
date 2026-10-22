-- v2 multi-tenant migration — idempotent-ish (TiDB supports IF NOT EXISTS on ADD COLUMN / CREATE INDEX)
-- Run on the DEV database first (classroom_v2); production only after user approval.

-- 1) schools → tenant with subscription
ALTER TABLE schools ADD COLUMN IF NOT EXISTS code VARCHAR(20) NULL;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS subscriptionStart VARCHAR(10) NULL;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS subscriptionEnd VARCHAR(10) NULL;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS phone VARCHAR(30) NULL;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS note TEXT NULL;

-- 2) users → platform accounts with roles
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(64) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS passwordHash VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS platformRole VARCHAR(20) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS schoolId INT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS displayName VARCHAR(120) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS active INT NOT NULL DEFAULT 1;

-- 3) academic years
CREATE TABLE IF NOT EXISTS academic_years (id INT AUTO_INCREMENT PRIMARY KEY, schoolId INT NOT NULL, title VARCHAR(40) NOT NULL, startDate VARCHAR(10) NULL, endDate VARCHAR(10) NULL, active INT NOT NULL DEFAULT 1, createdAt TIMESTAMP NOT NULL DEFAULT NOW());
ALTER TABLE classes ADD COLUMN IF NOT EXISTS academicYearId INT NULL;

-- 4) tenant scoping columns on every core table
ALTER TABLE teams ADD COLUMN IF NOT EXISTS schoolId INT NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS schoolId INT NULL;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS schoolId INT NULL;
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS schoolId INT NULL;
ALTER TABLE grades ADD COLUMN IF NOT EXISTS schoolId INT NULL;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS schoolId INT NULL;
ALTER TABLE student_team_transfers ADD COLUMN IF NOT EXISTS schoolId INT NULL;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS school_id INT NULL;

-- 4b) phase 2: period attendance + graduated flag + weekly schedule
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS period INT NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS graduated INT NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS schedule_slots (id INT AUTO_INCREMENT PRIMARY KEY, schoolId INT NULL, classId INT NOT NULL, dayOfWeek INT NOT NULL, period INT NOT NULL, subjectId INT NULL, createdAt TIMESTAMP NOT NULL DEFAULT NOW());
ALTER TABLE schedule_slots ADD INDEX IF NOT EXISTS idx_slots_class_day_period (classId, dayOfWeek, period);

-- 4c) phase 3: exams + calendar events + exam-linked grades
CREATE TABLE IF NOT EXISTS exams (id INT AUTO_INCREMENT PRIMARY KEY, schoolId INT NULL, classId INT NOT NULL, subjectId INT NULL, title VARCHAR(160) NOT NULL, examType VARCHAR(20) NOT NULL DEFAULT 'quiz', date VARCHAR(10) NOT NULL, maxScore INT NOT NULL DEFAULT 20, weight INT NOT NULL DEFAULT 1, note TEXT NULL, createdAt TIMESTAMP NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS events (id INT AUTO_INCREMENT PRIMARY KEY, schoolId INT NULL, classId INT NULL, title VARCHAR(180) NOT NULL, kind ENUM('exam','homework','activity','meeting','other') NOT NULL DEFAULT 'other', date VARCHAR(10) NOT NULL, note TEXT NULL, createdAt TIMESTAMP NOT NULL DEFAULT NOW());
ALTER TABLE grades ADD COLUMN IF NOT EXISTS examId INT NULL;
ALTER TABLE exams ADD INDEX IF NOT EXISTS idx_exams_school_class (schoolId, classId);
ALTER TABLE exams ADD INDEX IF NOT EXISTS idx_exams_school_date (schoolId, date);
ALTER TABLE events ADD INDEX IF NOT EXISTS idx_events_school_date (schoolId, date);
CREATE TABLE IF NOT EXISTS school_settings (school_id INT PRIMARY KEY, bot_token TEXT NULL, channel_id VARCHAR(128) NULL, webhook_secret VARCHAR(64) NULL, bot_username VARCHAR(64) NULL, webhook_url VARCHAR(255) NULL, referral_points DECIMAL(10,2) NULL, referral_leave_penalty TINYINT NULL, updated_at BIGINT NOT NULL DEFAULT 0);
ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS points_grade_base DOUBLE NULL;
ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS points_grade_divisor DOUBLE NULL;

-- 5) backfill schoolId from class relationships (only where NULL)
UPDATE teams t JOIN classes c ON t.classId = c.id SET t.schoolId = c.schoolId WHERE t.schoolId IS NULL;
UPDATE students s JOIN classes c ON s.classId = c.id SET s.schoolId = c.schoolId WHERE s.schoolId IS NULL;
UPDATE attendance a JOIN students s ON a.studentId = s.id SET a.schoolId = s.schoolId WHERE a.schoolId IS NULL;
UPDATE subjects sb JOIN classes c ON sb.classId = c.id SET sb.schoolId = c.schoolId WHERE sb.schoolId IS NULL;
UPDATE grades g JOIN students s ON g.studentId = s.id SET g.schoolId = s.schoolId WHERE g.schoolId IS NULL;
UPDATE activities ac LEFT JOIN students s ON ac.studentId = s.id LEFT JOIN teams t ON ac.teamId = t.id SET ac.schoolId = COALESCE(s.schoolId, t.schoolId) WHERE ac.schoolId IS NULL;
UPDATE student_team_transfers tr JOIN students s ON tr.studentId = s.id SET tr.schoolId = s.schoolId WHERE tr.schoolId IS NULL;
UPDATE referrals r JOIN students s ON r.student_id = s.id SET r.school_id = s.schoolId WHERE r.school_id IS NULL;

-- 6) login lookups: unique code per school, unique username per school
ALTER TABLE schools ADD UNIQUE INDEX IF NOT EXISTS uq_schools_code (code);
ALTER TABLE users ADD INDEX IF NOT EXISTS idx_users_school_username (schoolId, username);
ALTER TABLE schools ADD INDEX IF NOT EXISTS idx_schools_status (status);

-- 7) phase 4: parents (parent access code) + white-label (logo/color)
ALTER TABLE students ADD COLUMN IF NOT EXISTS parentName VARCHAR(120) NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS parentPhone VARCHAR(30) NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS parentCode VARCHAR(24) NULL;
ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS logo_data TEXT NULL;
ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS primary_color VARCHAR(20) NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_students_parent_code ON students(parentCode);
