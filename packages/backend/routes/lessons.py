from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.database import get_connection
from app.auth import require_auth
router = APIRouter(prefix="/lessons", tags=["Lessons"])
class CreateLessonRequest(BaseModel):
    type: str
    date: str
    startTime: str
    group: Optional[str] = None
    teacher: Optional[str] = None
    hall: Optional[str] = None
    topic: Optional[str] = None
    duration: str = "60"
    comment: Optional[str] = None
    direction: Optional[str] = None
    repeat: str = "none"
    additional: bool = False
class RescheduleRequest(BaseModel):
    new_date: str
    new_time: str
    new_hall_id: Optional[int] = None
    reason: Optional[str] = None
async def resolve_teacher_id(pool, user_id: int) -> Optional[int]:
    row = await pool.fetchrow(
        "SELECT id FROM teachers WHERE user_id = $1",
        user_id
    )
    return row["id"] if row else None
async def resolve_student_id(pool, user_id: int) -> Optional[int]:
    row = await pool.fetchrow(
        "SELECT id FROM students WHERE user_id = $1",
        user_id
    )
    return row["id"] if row else None
@router.post("")
async def create_lesson(data: CreateLessonRequest, user: dict = Depends(require_auth)):
    user_role = user.get("role")
    if user_role not in ["teacher", "admin"]:
        raise HTTPException(status_code=403, detail="Teacher or admin role required")
    pool = await get_connection()
    if user_role == "admin":
        if not data.teacher:
            raise HTTPException(status_code=400, detail="Teacher selection is required for admin users")
        teacher_id = int(data.teacher)
    else:
        teacher_id = await resolve_teacher_id(pool, user["id"])
        if not teacher_id:
            raise HTTPException(status_code=400, detail="User is not registered as a teacher")
    start_datetime = datetime.fromisoformat(f"{data.date}T{data.startTime}")
    lesson_data = {
        "group_id": int(data.group) if data.group else None,
        "class_name": data.topic or "Урок",
        "teacher_id": teacher_id,
        "hall_id": int(data.hall) if data.hall else None,
        "start_time": start_datetime,
        "duration_minutes": int(data.duration),
        "lesson_type": data.type,
        "topic": data.topic,
        "comment": data.comment,
        "direction": data.direction,
        "repeat_frequency": data.repeat,
        "is_additional": data.additional
    }
    result = await pool.fetchrow(
        """
        INSERT INTO lessons (
            group_id, class_subject_id, class_name, teacher_id, hall_id, start_time,
            duration_minutes, lesson_type, topic, comment, direction,
            repeat_frequency, is_additional
        ) VALUES (
            $1,
            (SELECT id FROM class_subjects WHERE group_id = $1 ORDER BY is_elective ASC, id ASC LIMIT 1),
            $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
        )
        RETURNING id
        """,
        lesson_data["group_id"], lesson_data["class_name"], lesson_data["teacher_id"],
        lesson_data["hall_id"], lesson_data["start_time"], lesson_data["duration_minutes"],
        lesson_data["lesson_type"], lesson_data["topic"], lesson_data["comment"],
        lesson_data["direction"], lesson_data["repeat_frequency"], lesson_data["is_additional"]
    )
    return {"message": "Lesson created successfully", "lesson_id": result["id"]}

@router.get("/teacher")
async def get_teacher_lessons(user: dict = Depends(require_auth)):
    user_role = user.get("role")
    if user_role not in ["teacher", "admin"]:
        raise HTTPException(status_code=403, detail="Teacher role required")
    pool = await get_connection()
    teacher_id = await resolve_teacher_id(pool, user["id"])
    if not teacher_id and user_role == "teacher":
        raise HTTPException(status_code=404, detail="Teacher profile not found")
    if user_role == "admin":
        rows = await pool.fetch(
            """
            SELECT
                l.id, l.class_name, l.start_time, l.duration_minutes,
                l.is_cancelled, l.is_rescheduled, l.lesson_type,
                g.name AS group_name, h.name AS hall_name, u.name AS teacher_name
            FROM lessons l
            LEFT JOIN groups g ON g.id = l.group_id
            LEFT JOIN halls h ON h.id = l.hall_id
            LEFT JOIN teachers t ON t.id = l.teacher_id
            LEFT JOIN users u ON u.id = t.user_id
            ORDER BY l.start_time DESC
            """
        )
    else:
        rows = await pool.fetch(
            """
            SELECT
                l.id, l.class_name, l.start_time, l.duration_minutes,
                l.is_cancelled, l.is_rescheduled, l.lesson_type,
                g.name AS group_name, h.name AS hall_name, u.name AS teacher_name
            FROM lessons l
            LEFT JOIN groups g ON g.id = l.group_id
            LEFT JOIN halls h ON h.id = l.hall_id
            LEFT JOIN teachers t ON t.id = l.teacher_id
            LEFT JOIN users u ON u.id = t.user_id
            WHERE l.teacher_id = $1
            ORDER BY l.start_time DESC
            """,
            teacher_id
        )
    lessons = [
        {
            "id": r["id"],
            "class_name": r["class_name"],
            "start_time": str(r["start_time"]) if r["start_time"] else None,
            "duration_minutes": r["duration_minutes"],
            "is_cancelled": r["is_cancelled"],
            "is_rescheduled": r["is_rescheduled"],
            "lesson_type": r["lesson_type"],
            "group_name": r["group_name"],
            "hall_name": r["hall_name"],
            "teacher_name": r["teacher_name"]
        }
        for r in rows
    ]
    return {"lessons": lessons}
@router.get("/student")
async def get_student_lessons(user: dict = Depends(require_auth)):
    if user.get("role") != "student":
        raise HTTPException(status_code=403, detail="Student role required")
    pool = await get_connection()
    student_id = await resolve_student_id(pool, user["id"])
    if not student_id:
        raise HTTPException(status_code=404, detail="Student profile not found")
    rows = await pool.fetch(
        """
        SELECT
            l.id, l.class_name, l.start_time, l.duration_minutes,
            l.is_cancelled, l.is_rescheduled,
            g.name AS group_name, h.name AS hall_name, u.name AS teacher_name
        FROM lessons l
        JOIN groups g ON g.id = l.group_id
        JOIN group_students gs ON gs.group_id = g.id AND gs.student_id = $1
        LEFT JOIN halls h ON h.id = l.hall_id
        LEFT JOIN teachers t ON t.id = l.teacher_id
        LEFT JOIN users u ON u.id = t.user_id
        ORDER BY l.start_time DESC
        """,
        student_id
    )
    lessons = [
        {
            "id": r["id"],
            "class_name": r["class_name"],
            "start_time": str(r["start_time"]) if r["start_time"] else None,
            "duration_minutes": r["duration_minutes"],
            "is_cancelled": r["is_cancelled"],
            "is_rescheduled": r["is_rescheduled"],
            "group_name": r["group_name"],
            "hall_name": r["hall_name"],
            "teacher_name": r["teacher_name"]
        }
        for r in rows
    ]
    return {"lessons": lessons}
@router.post("/{lesson_id}/reschedule")
async def create_reschedule_request(lesson_id: int, data: RescheduleRequest, user: dict = Depends(require_auth)):
    pool = await get_connection()
    new_start_time = datetime.fromisoformat(f"{data.new_date}T{data.new_time}")
    if user.get("role") == "teacher":
        teacher_id = await resolve_teacher_id(pool, user["id"])
        if not teacher_id:
            raise HTTPException(status_code=404, detail="Teacher profile not found")
        result = await pool.fetchrow(
            """
            INSERT INTO reschedule_requests (lesson_id, teacher_id, new_start_time, new_hall_id, reason, status)
            VALUES ($1, $2, $3, $4, $5, 'pending')
            RETURNING id
            """,
            lesson_id, teacher_id, new_start_time, data.new_hall_id, data.reason
        )
    else:
        result = await pool.fetchrow(
            """
            INSERT INTO reschedule_requests (lesson_id, new_start_time, new_hall_id, reason, status)
            VALUES ($1, $2, $3, $4, 'pending')
            RETURNING id
            """,
            lesson_id, new_start_time, data.new_hall_id, data.reason
        )
    return {"request_id": result["id"], "message": "Reschedule request submitted"}
@router.get("/reschedule-requests")
async def get_reschedule_requests(user: dict = Depends(require_auth)):
    pool = await get_connection()
    if user.get("role") == "admin":
        rows = await pool.fetch(
            """
            SELECT
                rr.id, rr.lesson_id, rr.new_start_time, rr.new_hall_id, rr.reason, rr.status, rr.created_at,
                u.name AS teacher_name, l.class_name
            FROM reschedule_requests rr
            LEFT JOIN teachers t ON t.id = rr.teacher_id
            LEFT JOIN users u ON u.id = t.user_id
            LEFT JOIN lessons l ON l.id = rr.lesson_id
            ORDER BY rr.created_at DESC
            """
        )
    elif user.get("role") == "teacher":
        teacher_id = await resolve_teacher_id(pool, user["id"])
        rows = await pool.fetch(
            """
            SELECT
                rr.id, rr.lesson_id, rr.new_start_time, rr.new_hall_id, rr.reason, rr.status, rr.created_at,
                u.name AS teacher_name, l.class_name
            FROM reschedule_requests rr
            LEFT JOIN teachers t ON t.id = rr.teacher_id
            LEFT JOIN users u ON u.id = t.user_id
            LEFT JOIN lessons l ON l.id = rr.lesson_id
            WHERE rr.teacher_id = $1
            ORDER BY rr.created_at DESC
            """,
            teacher_id
        )
    else:
        raise HTTPException(status_code=403, detail="Access denied")
    return {
        "requests": [
            {
                "id": r["id"],
                "lesson_id": r["lesson_id"],
                "new_start_time": str(r["new_start_time"]) if r["new_start_time"] else None,
                "new_hall_id": r["new_hall_id"],
                "reason": r["reason"],
                "status": r["status"],
                "created_at": str(r["created_at"]) if r["created_at"] else None,
                "teacher_name": r["teacher_name"],
                "class_name": r["class_name"]
            }
            for r in rows
        ]
    }
@router.get("/halls")
async def get_halls():
    pool = await get_connection()
    rows = await pool.fetch("SELECT id, name, capacity FROM halls ORDER BY name")
    return {
        "halls": [
            {"id": r["id"], "name": r["name"], "capacity": r["capacity"]}
            for r in rows
        ]
    }
@router.get("/groups")
async def get_groups():
    pool = await get_connection()
    rows = await pool.fetch(
        """
        SELECT id, name FROM groups WHERE is_closed = FALSE
        ORDER BY name
        """
    )
    return {
        "groups": [
            {"id": r["id"], "name": r["name"]}
            for r in rows
        ]
    }
