from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import connect_to_database, close_database
from .config import get_settings
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from routes import auth, users, students, groups, teachers, admin, lessons, categories, notifications
settings = get_settings()
@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_database()
    yield
    await close_database()
app = FastAPI(
    title="NomadDance API",
    description="Dance school management system API",
    version="1.0.0",
    lifespan=lifespan
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
@app.get("/")
async def root():
    return {
        "message": "Nomad Dance Academy API",
        "status": "running",
        "version": "1.0.0",
        "docs": "/docs"
    }
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(students.router)
app.include_router(groups.router)
app.include_router(teachers.router)
app.include_router(admin.router)
app.include_router(lessons.router)
app.include_router(categories.router)
app.include_router(notifications.router)
@app.get("/health")
async def health_check():
    return {"status": "ok"}
@app.get("/debug/routes")
async def debug_routes():
    routes = [
        "/auth/register",
        "/auth/login",
        "/groups/available",
        "/groups/schedule",
        "/groups/{id}/join",
        "/groups/{id}/trial",
        "/groups/{id}/additional-request",
        "/admin/analytics",
        "/admin/halls/{hallId}/schedule",
        "/admin/groups",
        "/admin/groups/{groupId}/limit",
        "/admin/teachers/{teacherId}/groups/{groupId}",
        "/admin/groups/{groupId}/students/{studentId}",
        "/admin/additional-lessons/{exceptionId}/decision",
        "/admin/halls",
        "/admin/teachers",
        "/students/me"
    ]
    return {"routes": routes}
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="localhost", port=8080)
