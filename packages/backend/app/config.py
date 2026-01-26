from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import List
class Settings(BaseSettings):
    JWT_SECRET: str
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_NAME: str = "postgres"
    DB_USER: str = "postgres"
    DB_PASSWORD: str = "postgres"
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:3001"
    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]
    class Config:
        env_file = ".env"
@lru_cache()
def get_settings():
    return Settings()
