from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import List
import os


class Settings(BaseSettings):
    ENV: str = "development"
    JWT_SECRET: str
    REFRESH_TOKEN_DAYS: int = 30

    DATABASE_URL: str | None = None

    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_NAME: str = "postgres"
    DB_USER: str = "postgres"
    DB_PASSWORD: str | None = None
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:3001"

    ENABLE_CORS: bool = True

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

    model_config = {
        "env_file": os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"),
        "extra": "ignore",
    }


@lru_cache()
def get_settings():
    return Settings()
