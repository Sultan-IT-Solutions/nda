import os
import sys
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

connect_to_database = None
close_database = None
get_settings = None

auth = users = students = groups = teachers = admin = lessons = categories = subjects = notifications = grades = audit_logs = audit_ingest = transcript = None
syssettings = None

try:
    from app.database import connect_to_database, close_database
except Exception:
    traceback.print_exc()

try:
    from app.config import get_settings
except Exception:
    traceback.print_exc()

try:
    from routes import (
        admin,
        auth,
        audit_logs,
        audit_ingest,
        categories,
    subjects,
        grades,
        groups,
        lessons,
        notifications,
        students,
        syssettings,
        teachers,
        transcript,
        users,
    )
except Exception:
    traceback.print_exc()


def _get_cors_origins():
    if get_settings is None:
        return ["*"]
    try:
        settings = get_settings()
        origins = getattr(settings, "cors_origins_list", None)
        return origins if origins else ["*"]
    except Exception:
        traceback.print_exc()
        return ["*"]

@asynccontextmanager
async def lifespan(app: FastAPI):
    if connect_to_database is not None:
        try:
            await connect_to_database()
            try:
                from app.database import get_connection

                pool = await get_connection()
                async with pool.acquire() as conn:
                    await conn.execute("ALTER TABLE groups ADD COLUMN IF NOT EXISTS trial_price INTEGER")
                    await conn.execute("ALTER TABLE groups ADD COLUMN IF NOT EXISTS trial_currency TEXT")
                    await conn.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS trials_allowed INTEGER DEFAULT 1")
                    await conn.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS trials_used INTEGER DEFAULT 0")
                    await conn.execute(
                        """
                        CREATE TABLE IF NOT EXISTS subjects (
                            id SERIAL PRIMARY KEY,
                            name TEXT UNIQUE NOT NULL,
                            description TEXT,
                            color TEXT DEFAULT '#3B82F6',
                            created_at TIMESTAMPTZ DEFAULT NOW()
                        )
                        """
                    )
                    await conn.execute(
                        """
                        CREATE TABLE IF NOT EXISTS class_subjects (
                            id SERIAL PRIMARY KEY,
                            group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
                            subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
                            is_elective BOOLEAN DEFAULT FALSE,
                            hall_id INTEGER REFERENCES halls(id) ON DELETE SET NULL,
                            created_at TIMESTAMPTZ DEFAULT NOW(),
                            UNIQUE (group_id, subject_id)
                        )
                        """
                    )
                    await conn.execute(
                        """
                        DO $$
                        BEGIN
                            IF EXISTS (
                                SELECT 1
                                FROM pg_constraint
                                WHERE conname = 'class_subjects_subject_id_fkey'
                            ) THEN
                                ALTER TABLE class_subjects DROP CONSTRAINT class_subjects_subject_id_fkey;
                            END IF;
                            IF NOT EXISTS (
                                SELECT 1
                                FROM pg_constraint
                                WHERE conname = 'class_subjects_subject_id_fkey_subjects'
                            ) THEN
                                ALTER TABLE class_subjects
                                ADD CONSTRAINT class_subjects_subject_id_fkey_subjects
                                FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE;
                            END IF;
                        END $$;
                        """
                    )
                    await conn.execute(
                        """
                        CREATE TABLE IF NOT EXISTS class_subject_students (
                            id SERIAL PRIMARY KEY,
                            class_subject_id INTEGER REFERENCES class_subjects(id) ON DELETE CASCADE,
                            student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
                            UNIQUE (class_subject_id, student_id)
                        )
                        """
                    )
                    await conn.execute(
                        """
                        CREATE TABLE IF NOT EXISTS class_subject_teachers (
                            id SERIAL PRIMARY KEY,
                            class_subject_id INTEGER REFERENCES class_subjects(id) ON DELETE CASCADE,
                            teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
                            is_main BOOLEAN DEFAULT FALSE,
                            UNIQUE (class_subject_id, teacher_id)
                        )
                        """
                    )
                    await conn.execute(
                        "CREATE INDEX IF NOT EXISTS idx_class_subjects_group_id ON class_subjects(group_id)"
                    )
                    await conn.execute(
                        "CREATE INDEX IF NOT EXISTS idx_class_subject_students_subject_id ON class_subject_students(class_subject_id)"
                    )
                    await conn.execute(
                        "CREATE INDEX IF NOT EXISTS idx_class_subject_teachers_subject_id ON class_subject_teachers(class_subject_id)"
                    )
                    await conn.execute(
                        """
                        CREATE TABLE IF NOT EXISTS trial_lesson_usages (
                            id SERIAL PRIMARY KEY,
                            student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
                            group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
                            lesson_id INTEGER REFERENCES lessons(id) ON DELETE SET NULL,
                            lesson_start_time TIMESTAMP,
                            used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        )
                        """
                    )
                    await conn.execute("CREATE INDEX IF NOT EXISTS idx_trial_usages_student_id ON trial_lesson_usages(student_id)")
                    await conn.execute("CREATE INDEX IF NOT EXISTS idx_trial_usages_used_at ON trial_lesson_usages(used_at)")

                    await conn.execute(
                        """
                        CREATE TABLE IF NOT EXISTS grades (
                            id SERIAL PRIMARY KEY,
                            student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
                            group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
                            class_subject_id INTEGER REFERENCES class_subjects(id) ON DELETE SET NULL,
                            attendance_record_id INTEGER REFERENCES attendance_records(id) ON DELETE CASCADE,
                            lesson_id INTEGER REFERENCES lessons(id) ON DELETE SET NULL,
                            teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
                            value NUMERIC(5, 2) NOT NULL,
                            comment TEXT,
                            grade_date DATE,
                            created_at TIMESTAMPTZ DEFAULT NOW(),
                            updated_at TIMESTAMPTZ DEFAULT NOW(),
                            UNIQUE (student_id, lesson_id)
                        )
                        """
                    )
                    await conn.execute(
                        "ALTER TABLE grades ADD COLUMN IF NOT EXISTS attendance_record_id INTEGER"
                    )
                    await conn.execute("ALTER TABLE grades ADD COLUMN IF NOT EXISTS student_id INTEGER")
                    await conn.execute("ALTER TABLE grades ADD COLUMN IF NOT EXISTS group_id INTEGER")
                    await conn.execute("ALTER TABLE grades ADD COLUMN IF NOT EXISTS class_subject_id INTEGER")
                    await conn.execute("ALTER TABLE grades ADD COLUMN IF NOT EXISTS lesson_id INTEGER")
                    await conn.execute("ALTER TABLE grades ADD COLUMN IF NOT EXISTS teacher_id INTEGER")
                    await conn.execute("ALTER TABLE grades ADD COLUMN IF NOT EXISTS value NUMERIC(5, 2)")
                    await conn.execute("ALTER TABLE grades ADD COLUMN IF NOT EXISTS comment TEXT")
                    await conn.execute("ALTER TABLE grades ADD COLUMN IF NOT EXISTS grade_date DATE")
                    await conn.execute("ALTER TABLE grades ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()")
                    await conn.execute("ALTER TABLE grades ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()")
                    await conn.execute("ALTER TABLE grades ADD COLUMN IF NOT EXISTS type TEXT")
                    await conn.execute("ALTER TABLE grades ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ")
                    await conn.execute("ALTER TABLE grades ALTER COLUMN value TYPE NUMERIC(6, 2)")
                    await conn.execute("ALTER TABLE grades ALTER COLUMN grade_value TYPE NUMERIC(6, 2)")

                    await conn.execute("ALTER TABLE lessons ADD COLUMN IF NOT EXISTS class_subject_id INTEGER")
                    await conn.execute("ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS class_subject_id INTEGER")

                    await conn.execute("CREATE INDEX IF NOT EXISTS idx_lessons_class_subject_id ON lessons(class_subject_id)")
                    await conn.execute("CREATE INDEX IF NOT EXISTS idx_attendance_records_class_subject_id ON attendance_records(class_subject_id)")
                    await conn.execute("CREATE INDEX IF NOT EXISTS idx_grades_class_subject_id ON grades(class_subject_id)")

                    await conn.execute(
                        """
                        DO $$
                        BEGIN
                            IF NOT EXISTS (
                                SELECT 1
                                FROM pg_constraint
                                WHERE conname = 'lessons_class_subject_id_fkey'
                            ) THEN
                                ALTER TABLE lessons
                                ADD CONSTRAINT lessons_class_subject_id_fkey
                                FOREIGN KEY (class_subject_id)
                                REFERENCES class_subjects(id)
                                ON DELETE SET NULL;
                            END IF;
                        END $$;
                        """
                    )
                    await conn.execute(
                        """
                        DO $$
                        BEGIN
                            IF NOT EXISTS (
                                SELECT 1
                                FROM pg_constraint
                                WHERE conname = 'attendance_records_class_subject_id_fkey'
                            ) THEN
                                ALTER TABLE attendance_records
                                ADD CONSTRAINT attendance_records_class_subject_id_fkey
                                FOREIGN KEY (class_subject_id)
                                REFERENCES class_subjects(id)
                                ON DELETE SET NULL;
                            END IF;
                        END $$;
                        """
                    )
                    await conn.execute(
                        """
                        DO $$
                        BEGIN
                            IF NOT EXISTS (
                                SELECT 1
                                FROM pg_constraint
                                WHERE conname = 'grades_class_subject_id_fkey'
                            ) THEN
                                ALTER TABLE grades
                                ADD CONSTRAINT grades_class_subject_id_fkey
                                FOREIGN KEY (class_subject_id)
                                REFERENCES class_subjects(id)
                                ON DELETE SET NULL;
                            END IF;
                        END $$;
                        """
                    )
                    await conn.execute(
                        """
                        DO $$
                        BEGIN
                            IF EXISTS (
                                SELECT 1
                                FROM information_schema.columns
                                WHERE table_name = 'grades' AND column_name = 'grade_value'
                            ) THEN
                                IF EXISTS (
                                    SELECT 1
                                    FROM pg_constraint
                                    WHERE conname = 'grades_grade_value_check'
                                ) THEN
                                    ALTER TABLE grades DROP CONSTRAINT grades_grade_value_check;
                                END IF;
                                ALTER TABLE grades
                                ADD CONSTRAINT grades_grade_value_check
                                CHECK (grade_value >= 0 AND grade_value <= 100);
                            END IF;
                        END $$;
                        """
                    )

                    await conn.execute(
                        """
                        DO $$
                        BEGIN
                            IF NOT EXISTS (
                                SELECT 1
                                FROM pg_constraint
                                WHERE conname = 'grades_student_id_lesson_id_key'
                            ) THEN
                                ALTER TABLE grades
                                ADD CONSTRAINT grades_student_id_lesson_id_key
                                UNIQUE (student_id, lesson_id);
                            END IF;
                        END $$;
                        """
                    )
                    await conn.execute(
                        """
                        DO $$
                        BEGIN
                            IF NOT EXISTS (
                                SELECT 1
                                FROM pg_constraint
                                WHERE conname = 'grades_attendance_record_id_fkey'
                            ) THEN
                                ALTER TABLE grades
                                ADD CONSTRAINT grades_attendance_record_id_fkey
                                FOREIGN KEY (attendance_record_id)
                                REFERENCES attendance_records(id)
                                ON DELETE CASCADE;
                            END IF;
                        END $$;
                        """
                    )
                    await conn.execute(
                        "CREATE INDEX IF NOT EXISTS idx_grades_student_id ON grades(student_id)"
                    )
                    await conn.execute(
                        "CREATE INDEX IF NOT EXISTS idx_grades_attendance_record_id ON grades(attendance_record_id)"
                    )

                    await conn.execute(
                        """
                        CREATE TABLE IF NOT EXISTS transcript_records (
                            id SERIAL PRIMARY KEY,
                            student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
                            group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
                            group_name TEXT,
                            subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
                            subject_name TEXT,
                            subject_color TEXT,
                            average_value NUMERIC(6, 2) NOT NULL,
                            grade_count INTEGER NOT NULL DEFAULT 0,
                            grades_json JSONB,
                            published_at TIMESTAMPTZ DEFAULT NOW(),
                            published_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                            updated_at TIMESTAMPTZ DEFAULT NOW(),
                            UNIQUE (student_id, group_id, subject_id)
                        )
                        """
                    )
                    await conn.execute("ALTER TABLE transcript_records ADD COLUMN IF NOT EXISTS group_name TEXT")
                    await conn.execute("ALTER TABLE transcript_records ADD COLUMN IF NOT EXISTS subject_name TEXT")
                    await conn.execute("ALTER TABLE transcript_records ADD COLUMN IF NOT EXISTS subject_color TEXT")
                    await conn.execute(
                        """
                        DO $$
                        BEGIN
                            IF EXISTS (
                                SELECT 1
                                FROM pg_constraint
                                WHERE conname = 'transcript_records_group_id_fkey'
                            ) THEN
                                ALTER TABLE transcript_records DROP CONSTRAINT transcript_records_group_id_fkey;
                            END IF;
                            IF NOT EXISTS (
                                SELECT 1
                                FROM pg_constraint
                                WHERE conname = 'transcript_records_group_id_fkey_groups'
                            ) THEN
                                ALTER TABLE transcript_records
                                ADD CONSTRAINT transcript_records_group_id_fkey_groups
                                FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL;
                            END IF;
                        END $$;
                        """
                    )
                    await conn.execute(
                        """
                        DO $$
                        BEGIN
                            IF EXISTS (
                                SELECT 1
                                FROM pg_constraint
                                WHERE conname = 'transcript_records_subject_id_fkey'
                            ) THEN
                                ALTER TABLE transcript_records DROP CONSTRAINT transcript_records_subject_id_fkey;
                            END IF;
                            IF NOT EXISTS (
                                SELECT 1
                                FROM pg_constraint
                                WHERE conname = 'transcript_records_subject_id_fkey_subjects'
                            ) THEN
                                ALTER TABLE transcript_records
                                ADD CONSTRAINT transcript_records_subject_id_fkey_subjects
                                FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL;
                            END IF;
                        END $$;
                        """
                    )
                    await conn.execute(
                        "CREATE INDEX IF NOT EXISTS idx_transcript_records_student_id ON transcript_records(student_id)"
                    )
                    await conn.execute(
                        "CREATE INDEX IF NOT EXISTS idx_transcript_records_group_id ON transcript_records(group_id)"
                    )
                    await conn.execute(
                        "CREATE INDEX IF NOT EXISTS idx_transcript_records_subject_id ON transcript_records(subject_id)"
                    )

                    await conn.execute(
                        """
                        CREATE TABLE IF NOT EXISTS transcript_publications (
                            id SERIAL PRIMARY KEY,
                            group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
                            group_name TEXT,
                            subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
                            subject_name TEXT,
                            subject_color TEXT,
                            published_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                            total_students INTEGER DEFAULT 0,
                            total_lessons INTEGER DEFAULT 0,
                            published_at TIMESTAMPTZ DEFAULT NOW()
                        )
                        """
                    )
                    await conn.execute("ALTER TABLE transcript_publications ADD COLUMN IF NOT EXISTS group_name TEXT")
                    await conn.execute("ALTER TABLE transcript_publications ADD COLUMN IF NOT EXISTS subject_name TEXT")
                    await conn.execute("ALTER TABLE transcript_publications ADD COLUMN IF NOT EXISTS subject_color TEXT")
                    await conn.execute(
                        """
                        DO $$
                        BEGIN
                            IF EXISTS (
                                SELECT 1
                                FROM pg_constraint
                                WHERE conname = 'transcript_publications_group_id_fkey'
                            ) THEN
                                ALTER TABLE transcript_publications DROP CONSTRAINT transcript_publications_group_id_fkey;
                            END IF;
                            IF NOT EXISTS (
                                SELECT 1
                                FROM pg_constraint
                                WHERE conname = 'transcript_publications_group_id_fkey_groups'
                            ) THEN
                                ALTER TABLE transcript_publications
                                ADD CONSTRAINT transcript_publications_group_id_fkey_groups
                                FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL;
                            END IF;
                        END $$;
                        """
                    )
                    await conn.execute(
                        """
                        DO $$
                        BEGIN
                            IF EXISTS (
                                SELECT 1
                                FROM pg_constraint
                                WHERE conname = 'transcript_publications_subject_id_fkey'
                            ) THEN
                                ALTER TABLE transcript_publications DROP CONSTRAINT transcript_publications_subject_id_fkey;
                            END IF;
                            IF NOT EXISTS (
                                SELECT 1
                                FROM pg_constraint
                                WHERE conname = 'transcript_publications_subject_id_fkey_subjects'
                            ) THEN
                                ALTER TABLE transcript_publications
                                ADD CONSTRAINT transcript_publications_subject_id_fkey_subjects
                                FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL;
                            END IF;
                        END $$;
                        """
                    )
                    await conn.execute(
                        "CREATE INDEX IF NOT EXISTS idx_transcript_publications_group_id ON transcript_publications(group_id)"
                    )
                    await conn.execute(
                        "CREATE INDEX IF NOT EXISTS idx_transcript_publications_subject_id ON transcript_publications(subject_id)"
                    )
                print("DB migration ensured: groups.trial_price")
            except Exception:
                traceback.print_exc()
        except Exception:
            traceback.print_exc()
    yield
    if close_database is not None:
        try:
            await close_database()
        except Exception:
            traceback.print_exc()

app = FastAPI(
    title="NomadDance API",
    version="1.0.0",
    lifespan=lifespan,
)

if get_settings is not None:
    try:
        settings = get_settings()
        if getattr(settings, "ENABLE_CORS", True):
            app.add_middleware(
                CORSMiddleware,
                allow_origins=_get_cors_origins(),
                allow_credentials=True,
                allow_methods=["*"],
                allow_headers=["*"],
            )
    except Exception:
        traceback.print_exc()

@app.get("/")
async def root():
    return {"message": "NomadDance API", "status": "running"}

@app.get("/health")
async def health():
    return {"ok": True}

if auth is not None:
    app.include_router(auth.router)
if users is not None:
    app.include_router(users.router)
if students is not None:
    app.include_router(students.router)
if groups is not None:
    app.include_router(groups.router)
if teachers is not None:
    app.include_router(teachers.router)
if admin is not None:
    app.include_router(admin.router)
if lessons is not None:
    app.include_router(lessons.router)
if categories is not None:
    app.include_router(categories.router)
if subjects is not None:
    app.include_router(subjects.router)
if notifications is not None:
    app.include_router(notifications.router)
if syssettings is not None:
    app.include_router(syssettings.router)
if grades is not None:
    app.include_router(grades.router)
if transcript is not None:
    app.include_router(transcript.router)
if audit_logs is not None:
    app.include_router(audit_logs.router)
if audit_ingest is not None:
    app.include_router(audit_ingest.router)
