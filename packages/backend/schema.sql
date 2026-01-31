-- Nomad Dance Academy Database Schema
-- Run this SQL in your Neon database console to create all required tables

-- Users table (main authentication table)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'student', -- 'admin', 'teacher', 'student'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Students table (extended student info)
CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    phone_number VARCHAR(50),
    comment TEXT,
    trial_used BOOLEAN DEFAULT FALSE,
    trials_allowed INTEGER DEFAULT 1,
    trials_used INTEGER DEFAULT 0,
    subscription_until DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Teachers table (extended teacher info)
CREATE TABLE IF NOT EXISTS teachers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    hourly_rate DECIMAL(10, 2),
    bio TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Categories table (dance styles/categories)
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Halls table (dance halls/rooms)
CREATE TABLE IF NOT EXISTS halls (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    capacity INTEGER DEFAULT 20,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Groups table (dance groups/classes)
CREATE TABLE IF NOT EXISTS groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    hall_id INTEGER REFERENCES halls(id) ON DELETE SET NULL,
    main_teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    duration_minutes INTEGER DEFAULT 90,
    capacity INTEGER DEFAULT 12,
    class_name VARCHAR(255),
    direction VARCHAR(255),
    is_trial BOOLEAN DEFAULT FALSE,
    is_closed BOOLEAN DEFAULT FALSE,
    is_additional BOOLEAN DEFAULT FALSE,
    start_date DATE,
    end_date DATE,
    recurring_until DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Group schedules (recurring schedule patterns)
CREATE TABLE IF NOT EXISTS group_schedules (
    id SERIAL PRIMARY KEY,
    group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL, -- 0=Sunday, 1=Monday, etc.
    start_time TIME NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(group_id, day_of_week)
);

-- Group students (many-to-many relationship)
CREATE TABLE IF NOT EXISTS group_students (
    id SERIAL PRIMARY KEY,
    group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    is_trial BOOLEAN DEFAULT FALSE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(group_id, student_id)
);

-- Group teachers (many-to-many relationship for substitute teachers)
CREATE TABLE IF NOT EXISTS group_teachers (
    id SERIAL PRIMARY KEY,
    group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
    is_main BOOLEAN DEFAULT FALSE,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(group_id, teacher_id)
);

-- Lessons table (individual lesson instances)
CREATE TABLE IF NOT EXISTS lessons (
    id SERIAL PRIMARY KEY,
    group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    class_name VARCHAR(255),
    direction VARCHAR(255),
    start_time TIMESTAMP NOT NULL,
    duration_minutes INTEGER DEFAULT 90,
    hall_id INTEGER REFERENCES halls(id) ON DELETE SET NULL,
    teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    substitute_teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    is_cancelled BOOLEAN DEFAULT FALSE,
    is_rescheduled BOOLEAN DEFAULT FALSE,
    is_additional BOOLEAN DEFAULT FALSE,
    repeat_frequency VARCHAR(50),
    original_start_time TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Attendance table (per lesson)
CREATE TABLE IF NOT EXISTS attendance (
    id SERIAL PRIMARY KEY,
    lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    status VARCHAR(10) NOT NULL, -- 'P' (present), 'A' (absent), 'L' (late), 'E' (excused)
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    recorded_by INTEGER REFERENCES users(id),
    UNIQUE(lesson_id, student_id)
);

-- Attendance records table (per group session - used by teachers)
CREATE TABLE IF NOT EXISTS attendance_records (
    id SERIAL PRIMARY KEY,
    group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    attended BOOLEAN DEFAULT FALSE,
    status VARCHAR(50),
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(group_id, student_id, lesson_id)
);

-- Reschedule requests table
CREATE TABLE IF NOT EXISTS reschedule_requests (
    id SERIAL PRIMARY KEY,
    lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
    group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    requested_by_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    new_date DATE,
    new_time TIME,
    new_start_time TIMESTAMP,
    original_time TIMESTAMP,
    new_hall_id INTEGER REFERENCES halls(id) ON DELETE SET NULL,
    reason TEXT,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    reviewed_by INTEGER REFERENCES users(id),
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Teacher reschedule requests table
CREATE TABLE IF NOT EXISTS teacher_reschedule_requests (
    id SERIAL PRIMARY KEY,
    lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
    requested_by_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    new_date DATE NOT NULL,
    new_time TIME NOT NULL,
    new_hall_id INTEGER REFERENCES halls(id) ON DELETE SET NULL,
    reason TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    reviewed_by INTEGER REFERENCES users(id),
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
    type VARCHAR(100),
    group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
    related_id INTEGER,
    related_type VARCHAR(100),
    action_url TEXT,
    title VARCHAR(255),
    message TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Additional lesson requests (for students requesting extra lessons)
CREATE TABLE IF NOT EXISTS additional_lesson_requests (
    id SERIAL PRIMARY KEY,
    group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    requested_date DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    reviewed_by INTEGER REFERENCES users(id),
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_students_user_id ON students(user_id);
CREATE INDEX IF NOT EXISTS idx_teachers_user_id ON teachers(user_id);
CREATE INDEX IF NOT EXISTS idx_groups_category_id ON groups(category_id);
CREATE INDEX IF NOT EXISTS idx_groups_hall_id ON groups(hall_id);
CREATE INDEX IF NOT EXISTS idx_lessons_group_id ON lessons(group_id);
CREATE INDEX IF NOT EXISTS idx_lessons_start_time ON lessons(start_time);
CREATE INDEX IF NOT EXISTS idx_attendance_lesson_id ON attendance(lesson_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_group_students_group_id ON group_students(group_id);
CREATE INDEX IF NOT EXISTS idx_group_students_student_id ON group_students(student_id);

-- Insert a default admin user (password: admin123)
-- You should change this password immediately after first login!
INSERT INTO users (name, email, password, role)
VALUES ('Admin', 'admin@example.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4z0z0z0z0z0z0z0z', 'admin')
ON CONFLICT (email) DO NOTHING;
