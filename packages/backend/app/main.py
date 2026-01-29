from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
import sys
import traceback

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

connect_to_database = None
close_database = None
get_settings = None

auth = users = students = groups = teachers = admin = lessons = categories = notifications = None

try:
    from app.database import connect_to_database, close_database
except Exception:
    traceback.print_exc()

try:
    from app.config import get_settings
except Exception:
    traceback.print_exc()

try:
    from routes import auth, users, students, groups, teachers, admin, lessons, categories, notifications
except Exception:
    traceback.print_exc()

def _get_cors_origins():
    if get_settings is None:
        return ["*"]
    try:
        settings = get_settings()
        origins = getattr(settings, "cors_origins_list", None)
        if origins:
            # Check if any origin contains wildcard pattern
            has_wildcard = any("*" in origin for origin in origins)
            if has_wildcard:
                # If wildcards are used, allow all origins (CORS middleware doesn't support glob patterns)
                return ["*"]
            return origins
        return ["*"]
    except Exception:
        traceback.print_exc()
        return ["*"]

@asynccontextmanager
async def lifespan(app: FastAPI):
    if connect_to_database is not None:
        try:
            await connect_to_database()
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=_get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
if notifications is not None:
    app.include_router(notifications.router)
