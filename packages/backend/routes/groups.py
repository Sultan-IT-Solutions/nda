from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.database import get_connection
from app.auth import require_auth
router = APIRouter(prefix="/groups", tags=["Groups"])
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
@router.get("/filters")
async def get_filters():
    pool = await get_connection()
    teachers_rows = await pool.fetch(
        """
        SELECT DISTINCT u.id, u.name
        FROM users u
        INNER JOIN teachers t ON t.user_id = u.id
        WHERE EXISTS (
            SELECT 1 FROM group_teachers gt
            INNER JOIN groups g ON g.id = gt.group_id
            WHERE gt.teacher_id = t.id AND g.is_closed = FALSE
        )
        ORDER BY u.name
        """
    )
    halls_rows = await pool.fetch(
        """
        SELECT DISTINCT h.id, h.name
        FROM halls h
        WHERE EXISTS (
            SELECT 1 FROM groups g WHERE g.hall_id = h.id AND g.is_closed = FALSE
        )
        ORDER BY h.name
        """
    )
    return {
        "teachers": [{"id": r["id"], "name": r["name"]} for r in teachers_rows],
        "halls": [{"id": r["id"], "name": r["name"]} for r in halls_rows]
    }
@router.get("/available")
async def get_available_groups():
    pool = await get_connection()
    rows = await pool.fetch(
        """
        SELECT
            g.id,
            g.name,
            g.capacity,
            g.duration_minutes,
            g.is_trial,
            h.id AS hall_id,
            h.name AS hall_name,
            h.capacity AS hall_capacity,
            (SELECT COUNT(*) FROM group_students gs WHERE gs.group_id = g.id AND gs.is_trial = FALSE) AS enrolled,
            array_remove(array_agg(DISTINCT gt.teacher_id), NULL) AS teacher_ids,
            array_remove(array_agg(DISTINCT u.name), NULL) AS teacher_names
        FROM groups g
        LEFT JOIN halls h ON h.id = g.hall_id
        LEFT JOIN group_teachers gt ON gt.group_id = g.id
        LEFT JOIN teachers t ON t.id = gt.teacher_id
        LEFT JOIN users u ON u.id = t.user_id
        WHERE g.is_closed = FALSE AND g.is_additional = FALSE
        GROUP BY g.id, g.name, g.capacity, g.duration_minutes, g.is_trial, h.id, h.name, h.capacity
        ORDER BY g.id
        """
    )
    response = []
    for row in rows:
        capacity = row["capacity"]
        enrolled = int(row["enrolled"]) if row["enrolled"] else 0
        free_slots = capacity - enrolled if capacity else None
        teacher_names = row["teacher_names"] or []
        teacher_ids = row["teacher_ids"] or []
        schedule = await get_group_schedule_formatted(pool, row["id"])
        response.append({
            "id": row["id"],
            "name": row["name"],
            "capacity": capacity,
            "duration_minutes": row["duration_minutes"],
            "is_trial": row["is_trial"],
            "schedule": schedule,
            "hall": {
                "id": row["hall_id"],
                "name": row["hall_name"],
                "capacity": row["hall_capacity"]
            } if row["hall_id"] else None,
            "enrolled": enrolled,
            "free_slots": free_slots,
            "teacher_ids": [int(t) for t in teacher_ids if t],
            "teacher_names": [str(t) for t in teacher_names if t]
        })
    return response
@router.get("/schedule")
async def get_schedule(hallId: Optional[int] = None):
    pool = await get_connection()
    if hallId:
        base_schedule = await pool.fetch(
            """
            SELECT g.id, g.name, g.duration_minutes, g.is_additional,
                   h.id AS hall_id, h.name AS hall_name
            FROM groups g
            LEFT JOIN halls h ON h.id = g.hall_id
            WHERE g.hall_id = $1
            ORDER BY g.id
            """,
            hallId
        )
        additions = await pool.fetch(
            """
            SELECT se.id, se.group_id, se.start_time, se.duration_minutes, se.additional,
                   se.approved, se.requested_by_student, se.reason, h.id, h.name
            FROM schedule_exceptions se
            LEFT JOIN halls h ON h.id = se.hall_id
            WHERE se.hall_id = $1
            ORDER BY se.start_time NULLS LAST, se.id
            """,
            hallId
        )
    else:
        base_schedule = await pool.fetch(
            """
            SELECT g.id, g.name, g.duration_minutes, g.is_additional,
                   h.id AS hall_id, h.name AS hall_name
            FROM groups g
            LEFT JOIN halls h ON h.id = g.hall_id
            ORDER BY g.id
            """
        )
        additions = await pool.fetch(
            """
            SELECT se.id, se.group_id, se.start_time, se.duration_minutes, se.additional,
                   se.approved, se.requested_by_student, se.reason, h.id, h.name
            FROM schedule_exceptions se
            LEFT JOIN halls h ON h.id = se.hall_id
            ORDER BY se.start_time NULLS LAST, se.id
            """
        )
    additions_by_group = {}
    for row in additions:
        group_id = row["group_id"]
        if group_id not in additions_by_group:
            additions_by_group[group_id] = []
        additions_by_group[group_id].append({
            "id": row["id"],
            "start_time": str(row["start_time"]) if row["start_time"] else None,
            "duration_minutes": row["duration_minutes"],
            "is_additional": row["additional"],
            "approved": row["approved"],
            "requested_by_student": row["requested_by_student"],
            "reason": row["reason"],
            "hall": {"id": row[8], "name": row[9]} if row[8] else None
        })
    result = []
    for row in base_schedule:
        group_id = row["id"]
        schedule = await get_group_schedule_formatted(pool, group_id)
        result.append({
            "group_id": group_id,
            "group_name": row["name"],
            "schedule": schedule,
            "duration_minutes": row["duration_minutes"],
            "is_additional": row["is_additional"],
            "hall": {"id": row["hall_id"], "name": row["hall_name"]} if row["hall_id"] else None,
            "exceptions": additions_by_group.get(group_id, [])
        })
    return result
async def resolve_student_id(pool, user_id: int) -> Optional[int]:
    row = await pool.fetchrow(
        "SELECT id FROM students WHERE user_id = $1",
        user_id
    )
    return row["id"] if row else None
@router.post("/{group_id}/join")
async def join_group(group_id: int, user: dict = Depends(require_auth)):
    if user.get("role") != "student":
        raise HTTPException(status_code=403, detail="Только студенты могут записываться в группы")
    pool = await get_connection()
    student_id = await resolve_student_id(pool, user["id"])
    if not student_id:
        raise HTTPException(status_code=404, detail="Профиль студента не найден")
    info = await pool.fetchrow(
        """
        SELECT
            capacity,
            is_closed,
            (SELECT COUNT(*) FROM group_students gs WHERE gs.group_id = $1 AND gs.is_trial = FALSE) AS enrolled,
            EXISTS(
                SELECT 1 FROM group_students gs WHERE gs.group_id = $1 AND gs.student_id = $2
            ) AS already_joined
        FROM groups
        WHERE id = $1
        """,
        group_id, student_id
    )
    if not info:
        raise HTTPException(status_code=404, detail="Группа не найдена")
    if info["is_closed"]:
        raise HTTPException(status_code=409, detail="Группа закрыта для записи")
    if info["already_joined"]:
        raise HTTPException(status_code=409, detail="Вы уже записаны в эту группу")
    capacity = info["capacity"]
    enrolled = int(info["enrolled"]) if info["enrolled"] else 0
    if capacity and enrolled >= capacity:
        raise HTTPException(status_code=409, detail="Group is full")
    await pool.execute(
        """
        INSERT INTO group_students (group_id, student_id, is_trial)
        VALUES ($1, $2, FALSE)
        ON CONFLICT DO NOTHING
        """,
        group_id, student_id
    )
    return {"message": "Successfully joined the group"}
@router.post("/{group_id}/trial")
async def trial_lesson(group_id: int, user: dict = Depends(require_auth)):
    if user.get("role") != "student":
        raise HTTPException(status_code=403, detail="Only students may request trial lessons")
    pool = await get_connection()
    student_id = await resolve_student_id(pool, user["id"])
    if not student_id:
        raise HTTPException(status_code=404, detail="Student profile not found")
    async with pool.acquire() as conn:
        async with conn.transaction():
            student = await conn.fetchrow(
                "SELECT trial_used, trials_allowed, trials_used FROM students WHERE id = $1 FOR UPDATE",
                student_id
            )
            if not student:
                raise HTTPException(status_code=404, detail="Student profile not found")
            trials_used = student["trials_used"]
            trials_allowed = student["trials_allowed"]
            if trials_used >= trials_allowed:
                raise HTTPException(status_code=409, detail="No trial lessons remaining")
            existing = await conn.fetchrow(
                "SELECT 1 FROM group_students WHERE group_id = $1 AND student_id = $2",
                group_id, student_id
            )
            if existing:
                raise HTTPException(status_code=409, detail="Вы уже записаны в эту группу")
            await conn.execute(
                """
                INSERT INTO group_students (group_id, student_id, is_trial)
                VALUES ($1, $2, TRUE)
                """,
                group_id, student_id
            )
            new_trials_used = trials_used + 1
            trial_used = new_trials_used >= trials_allowed
            await conn.execute(
                "UPDATE students SET trial_used = $1, trials_used = $2 WHERE id = $3",
                trial_used, new_trials_used, student_id
            )
    return {"message": "Trial lesson registered successfully"}
class AdditionalLessonRequest(BaseModel):
    reason: Optional[str] = None
@router.post("/{group_id}/additional-request")
async def request_additional_lesson(group_id: int, data: AdditionalLessonRequest, user: dict = Depends(require_auth)):
    if user.get("role") != "student":
        raise HTTPException(status_code=403, detail="Only students may request additional lessons")
    pool = await get_connection()
    student_id = await resolve_student_id(pool, user["id"])
    if not student_id:
        raise HTTPException(status_code=404, detail="Student profile not found")
    is_member = await pool.fetchrow(
        "SELECT 1 FROM group_students WHERE group_id = $1 AND student_id = $2",
        group_id, student_id
    )
    if not is_member:
        raise HTTPException(status_code=403, detail="Must be a member of the group")
    group_info = await pool.fetchrow(
        """
        SELECT g.hall_id, gt.teacher_id
        FROM groups g
        LEFT JOIN group_teachers gt ON gt.group_id = g.id AND gt.is_main = TRUE
        WHERE g.id = $1
        """,
        group_id
    )
    if not group_info:
        raise HTTPException(status_code=404, detail="Group not found")
    result = await pool.fetchrow(
        """
        INSERT INTO schedule_exceptions (
            group_id, teacher_id, hall_id, start_time, duration_minutes,
            reason, additional, approved, requested_by_student
        ) VALUES ($1, $2, $3, NOW(), 90, $4, TRUE, FALSE, TRUE)
        RETURNING id
        """,
        group_id, group_info["teacher_id"], group_info["hall_id"], data.reason
    )
    return {"request_id": result["id"], "message": "Additional lesson request submitted"}
