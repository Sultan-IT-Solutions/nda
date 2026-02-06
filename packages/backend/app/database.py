import asyncpg
from typing import Optional
import ssl
from .config import get_settings
pool: Optional[asyncpg.Pool] = None
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
