from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

try:
    from app.database import connect_to_database, close_database
except Exception:
    connect_to_database = None
    close_database = None

try:
    from app.config import get_settings
except Exception:
    get_settings = None

try:
    from routes import auth, users, students, groups, teachers, admin, lessons, categories, notifications
except Exception:
    auth = users = students = groups = teachers = admin = lessons = categories = notifications = None

def _get_cors_origins():
    if get_settings is None:
        return ["*"]
    try:
        settings = get_settings()
        origins = getattr(settings, "cors_origins_list", None)
        return origins if origins else ["*"]
    except Exception:
        return ["*"]

@asynccontextmanager
async def lifespan(app: FastAPI):
    if connect_to_database is not None:
        try:
            await connect_to_database()
        except Exception:
            pass
    yield
    if close_database is not None:
        try:
            await close_database()
        except Exception:
            pass

app = FastAPI(lifespan=lifespan)

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

if auth: app.include_router(auth.router)
if users: app.include_router(users.router)
if students: app.include_router(students.router)
if groups: app.include_router(groups.router)
if teachers: app.include_router(teachers.router)
if admin: app.include_router(admin.router)
if lessons: app.include_router(lessons.router)
if categories: app.include_router(categories.router)
if notifications: app.include_router(notifications.router)
