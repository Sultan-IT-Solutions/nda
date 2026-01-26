import asyncpg
from typing import Optional
from .config import get_settings
pool: Optional[asyncpg.Pool] = None
async def connect_to_database():
    global pool
    settings = get_settings()
    print(f"Host: {settings.DB_HOST}, Port: {settings.DB_PORT}, Database: {settings.DB_NAME}, User: {settings.DB_USER}")
    try:
        pool = await asyncpg.create_pool(
            host=settings.DB_HOST,
            port=settings.DB_PORT,
            database=settings.DB_NAME,
            user=settings.DB_USER,
            password=settings.DB_PASSWORD or None,
            min_size=5,
            max_size=20
        )
        print("Connected to PostgreSQL successfully!")
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
