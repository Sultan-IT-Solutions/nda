import asyncpg
from typing import Optional
import ssl
import asyncio
from .config import get_settings
pool: Optional[asyncpg.Pool] = None

_trial_schema_ready: bool = False
_trial_schema_lock = asyncio.Lock()
async def connect_to_database():
    global pool
    settings = get_settings()
    try:
        if getattr(settings, "DATABASE_URL", None):
            pool = await asyncpg.create_pool(
                dsn=settings.DATABASE_URL,
                min_size=1,
                max_size=5,
            )
        else:
            ssl_ctx = None
            try:
                if isinstance(settings.DB_HOST, str) and "neon.tech" in settings.DB_HOST:
                    ssl_ctx = ssl.create_default_context()
            except Exception:
                ssl_ctx = None

            pool = await asyncpg.create_pool(
                host=settings.DB_HOST,
                port=settings.DB_PORT,
                database=settings.DB_NAME,
                user=settings.DB_USER,
                password=settings.DB_PASSWORD or None,
                ssl=ssl_ctx,
                min_size=1,
                max_size=5
            )
        target = "DATABASE_URL" if getattr(settings, "DATABASE_URL", None) else f"{settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME}"
        print(f"Connected to PostgreSQL successfully ({target})")
    except Exception as e:
        print(f"Failed to connect to PostgreSQL: {e}")
        raise
async def close_database():
    global pool
    if pool:
        await pool.close()
        print("🔌 Database connection closed")
async def get_connection():
    if pool is None:
        raise RuntimeError("Database pool is not initialized")
    return pool


async def ensure_trial_lesson_schema(db_pool: asyncpg.Pool) -> None:
    """Ensure DB schema needed for trial lessons exists.

    Vercel/serverless deployments may not reliably trigger FastAPI lifespan events,
    so we defensively ensure the schema at runtime before trial-related queries.
    """
    global _trial_schema_ready
    if _trial_schema_ready:
        return
    async with _trial_schema_lock:
        if _trial_schema_ready:
            return
        async with db_pool.acquire() as conn:
            await conn.execute("ALTER TABLE groups ADD COLUMN IF NOT EXISTS trial_price INTEGER")
            await conn.execute("ALTER TABLE groups ADD COLUMN IF NOT EXISTS trial_currency TEXT")
            await conn.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS trials_allowed INTEGER DEFAULT 1")
            await conn.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS trials_used INTEGER DEFAULT 0")
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
            await conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_trial_usages_student_id ON trial_lesson_usages(student_id)"
            )
            await conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_trial_usages_used_at ON trial_lesson_usages(used_at)"
            )
        _trial_schema_ready = True
