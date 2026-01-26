from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import timedelta
from app.database import get_connection
from app.auth import require_auth, require_student
router = APIRouter(prefix="/students", tags=["Students"])
DAY_NAMES_BY_NUM = {
    0: "Вс",
    1: "Пн",
    2: "Вт",
    3: "Ср",
    4: "Чт",
    5: "Пт",
    6: "Сб"
}
async def get_group_schedule_formatted(pool, group_id: int) -> str:
    lesson_count = await pool.fetchval(
        "SELECT COUNT(*) FROM lessons WHERE group_id = $1", group_id
    )
    if not lesson_count:
        return "Не назначено"
    rows = await pool.fetch(
        """
        SELECT day_of_week, start_time
        FROM group_schedules
        WHERE group_id = $1 AND is_active = TRUE
        ORDER BY day_of_week, start_time
        """,
        group_id
    )
    if not rows:
        return "Не назначено"
    day_times: dict = {}
    for row in rows:
        dow = row["day_of_week"]
        time_str = row["start_time"].strftime("%H:%M") if row["start_time"] else ""
        if dow not in day_times:
            day_times[dow] = []
        if time_str and time_str not in day_times[dow]:
            day_times[dow].append(time_str)
    parts = []
    for dow in sorted(day_times.keys()):
        day_name = DAY_NAMES_BY_NUM.get(dow, "?")
        times = ", ".join(day_times[dow])
        parts.append(f"{day_name} {times}")
    return ", ".join(parts)
class StudentProfileUpdate(BaseModel):
    phone_number: str
    comment: Optional[str] = None
@router.get("/me")
async def get_me(user: dict = Depends(require_student)):
    user_id = user["id"]
    pool = await get_connection()
    row = await pool.fetchrow(
        """
        SELECT s.id, s.user_id, u.name, u.email, s.phone_number, s.comment, s.trial_used, s.trials_allowed, s.trials_used, s.subscription_until
        FROM students s
        JOIN users u ON u.id = s.user_id
        WHERE s.user_id = $1
        """,
        user_id
    )
    if not row:
        raise HTTPException(status_code=404, detail="Student profile not found")
    return {
        "id": row["id"],
        "user_id": row["user_id"],        "name": row["name"],
        "email": row["email"],        "phone_number": row["phone_number"],
        "comment": row["comment"],
        "trial_used": row["trial_used"],
        "trials_allowed": row["trials_allowed"],
        "trials_used": row["trials_used"],
        "subscription_until": str(row["subscription_until"]) if row["subscription_until"] else None
    }
@router.post("/me")
async def update_me(data: StudentProfileUpdate, user: dict = Depends(require_student)):
    user_id = user["id"]
    if not data.phone_number:
        raise HTTPException(status_code=400, detail="phone_number is required")
    pool = await get_connection()
    row = await pool.fetchrow(
        """
        INSERT INTO students (user_id, phone_number, comment)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id) DO UPDATE SET
            phone_number = EXCLUDED.phone_number,
            comment = COALESCE(EXCLUDED.comment, students.comment)
        RETURNING id, user_id, phone_number, comment, trial_used, subscription_until
        """,
        user_id, data.phone_number, data.comment
    )
    return {
        "message": "Profile created/updated",
        "student": {
            "id": row["id"],
            "user_id": row["user_id"],
            "phone_number": row["phone_number"],
            "comment": row["comment"],
            "trial_used": row["trial_used"],
            "subscription_until": str(row["subscription_until"]) if row["subscription_until"] else None
        }
    }
async def resolve_student_id(pool, user_id: int) -> Optional[int]:
    row = await pool.fetchrow(
        "SELECT id FROM students WHERE user_id = $1",
        user_id
    )
    return row["id"] if row else None
@router.get("/my-groups")
async def get_my_groups(user: dict = Depends(require_student)):
    user_id = user["id"]
    pool = await get_connection()
    student_id = await resolve_student_id(pool, user_id)
    if not student_id:
        return {"groups": []}
    rows = await pool.fetch(
        """
        SELECT
            g.id,
            g.name,
            g.duration_minutes,
            g.is_closed,
            g.is_trial,
            g.start_date,
            g.recurring_until,
            h.name AS hall_name,
            u.name AS teacher_name,
            c.name AS category_name,
            g.capacity,
            (SELECT COUNT(*) FROM group_students WHERE group_id = g.id) AS enrolled
        FROM group_students gs
        JOIN groups g ON g.id = gs.group_id
        LEFT JOIN halls h ON h.id = g.hall_id
        LEFT JOIN categories c ON c.id = g.category_id
        LEFT JOIN group_teachers gt ON gt.group_id = g.id AND gt.is_main = TRUE
        LEFT JOIN teachers t ON t.id = gt.teacher_id
        LEFT JOIN users u ON u.id = t.user_id
        WHERE gs.student_id = $1
        ORDER BY g.name
        """,
        student_id
    )
    groups = []
    for r in rows:
        enrolled = int(r["enrolled"]) if r["enrolled"] else 0
        capacity = r["capacity"]
        schedule = await get_group_schedule_formatted(pool, r["id"])
        groups.append({
            "id": r["id"],
            "name": r["name"],
            "duration_minutes": r["duration_minutes"],
            "hall_name": r["hall_name"] or "Не указан",
            "teacher_name": r["teacher_name"] or "Не назначен",
            "category_name": r["category_name"],
            "capacity": capacity,
            "enrolled": enrolled,
            "free_slots": capacity - enrolled if capacity else None,
            "schedule": schedule,
            "isActive": not r["is_closed"],
            "is_trial": r["is_trial"],
            "start_date": r["start_date"].strftime("%Y-%m-%d") if r["start_date"] else None,
            "end_date": r["recurring_until"].strftime("%Y-%m-%d") if r["recurring_until"] else None
        })
    return {"groups": groups}

@router.get("/my-attendance")
async def get_my_attendance(user: dict = Depends(require_student)):
    user_id = user["id"]
    pool = await get_connection()
    student_id = await resolve_student_id(pool, user_id)
    if not student_id:
        raise HTTPException(status_code=404, detail="Student profile not found")
    lesson_rows = await pool.fetch(
        """
        SELECT
            l.id as lesson_id,
            l.class_name,
            l.start_time,
            l.duration_minutes,
            l.is_cancelled,
            g.id as group_id,
            g.name as group_name,
            c.name as category_name,
            h.name as hall_name,
            u.name as teacher_name,
            ar.id as attendance_id,
            ar.status,
            ar.recorded_at
        FROM lessons l
        JOIN groups g ON g.id = l.group_id
        LEFT JOIN categories c ON c.id = g.category_id
        LEFT JOIN halls h ON h.id = l.hall_id
        LEFT JOIN teachers t ON t.id = l.teacher_id
        LEFT JOIN users u ON u.id = t.user_id
        LEFT JOIN attendance_records ar ON ar.lesson_id = l.id AND ar.student_id = $1
        WHERE g.id IN (
            SELECT DISTINCT group_id FROM group_students WHERE student_id = $1
        )
        ORDER BY l.start_time DESC
        """,
        student_id
    )
    stats_rows = await pool.fetch(
        """
        SELECT
            g.id as group_id,
            g.name as group_name,
            c.name as category_name,
            COUNT(l.id) as total_lessons,
            COUNT(ar.id) as marked_lessons,
            COUNT(CASE WHEN ar.status = 'P' THEN 1 END) as present_count,
            COUNT(CASE WHEN ar.status = 'E' THEN 1 END) as excused_count,
            COUNT(CASE WHEN ar.status = 'L' THEN 1 END) as late_count,
            COUNT(CASE WHEN ar.status = 'A' THEN 1 END) as absent_count,
            COALESCE(
                SUM(CASE
                    WHEN ar.status = 'P' THEN 2
                    WHEN ar.status = 'E' THEN 2
                    WHEN ar.status = 'L' THEN 1
                    WHEN ar.status = 'A' THEN 0
                    ELSE 0
                END), 0
            ) as total_points
        FROM groups g
        LEFT JOIN categories c ON c.id = g.category_id
        LEFT JOIN lessons l ON l.group_id = g.id
        LEFT JOIN attendance_records ar ON ar.lesson_id = l.id AND ar.student_id = $1
        WHERE g.id IN (
            SELECT DISTINCT group_id FROM group_students WHERE student_id = $1
        )
        GROUP BY g.id, g.name, c.name
        ORDER BY g.name
        """,
        student_id
    )
    lessons = []
    for r in lesson_rows:
        end_time = r["start_time"] + timedelta(minutes=r["duration_minutes"])
        lessons.append({
            "id": r["attendance_id"],
            "lesson_id": r["lesson_id"],
            "class_name": r["class_name"],
            "start_time": r["start_time"].isoformat(),
            "end_time": end_time.isoformat(),
            "duration_minutes": r["duration_minutes"],
            "is_cancelled": r["is_cancelled"],
            "status": r["status"] if r["status"] else None,
            "status_display": {
                "P": "Присутствовал",
                "E": "Уважительная причина",
                "L": "Опоздал",
                "A": "Отсутствовал"
            }.get(r["status"], "Не отмечено" if r["status"] is None else "Неизвестно"),
            "points": {
                "P": 2,
                "E": 2,
                "L": 1,
                "A": 0
            }.get(r["status"], 0),
            "group_id": r["group_id"],
            "group_name": r["group_name"],
            "category_name": r["category_name"],
            "hall_name": r["hall_name"],
            "teacher_name": r["teacher_name"],
            "recorded_at": r["recorded_at"].isoformat() if r["recorded_at"] else None
        })
    attendance_stats = []
    for r in stats_rows:
        total_lessons = r["total_lessons"] if r["total_lessons"] else 0
        marked_lessons = r["marked_lessons"] if r["marked_lessons"] else 0
        total_points = float(r["total_points"])
        max_points_marked = marked_lessons * 2
        percentage = round((total_points / max_points_marked) * 100) if max_points_marked > 0 else 0
        max_points_total = total_lessons * 2
        attendance_stats.append({
            "id": r["group_id"],
            "title": r["group_name"],
            "category": r["category_name"],
            "total": total_lessons,
            "attended": r["present_count"] + r["late_count"] + r["excused_count"],
            "present": r["present_count"],
            "excused": r["excused_count"],
            "late": r["late_count"],
            "missed": r["absent_count"],
            "percentage": percentage,
            "points": total_points,
            "maxPoints": float(max_points_total)
        })
    return {"lessons": lessons, "attendance": attendance_stats}

@router.get("/notifications")
async def get_notifications(user: dict = Depends(require_student)):
    user_id = user["id"]
    pool = await get_connection()
    student_id = await resolve_student_id(pool, user_id)
    if not student_id:
        raise HTTPException(status_code=404, detail="Student profile not found")
    rows = await pool.fetch(
        """
        SELECT id, type, group_id, title, message, is_read, created_at
        FROM notifications
        WHERE student_id = $1
        ORDER BY created_at DESC
        LIMIT 50
        """,
        student_id
    )
    notifications = [
        {
            "id": r["id"],
            "type": r["type"],
            "group_id": r["group_id"],
            "title": r["title"],
            "message": r["message"],
            "is_read": r["is_read"],
            "created_at": str(r["created_at"]) if r["created_at"] else None
        }
        for r in rows
    ]
    return {"notifications": notifications}
    
@router.post("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: int, user: dict = Depends(require_student)):
    pool = await get_connection()
    await pool.execute(
        "UPDATE notifications SET is_read = TRUE WHERE id = $1",
        notification_id
    )
    return {"message": "Notification marked as read"}
