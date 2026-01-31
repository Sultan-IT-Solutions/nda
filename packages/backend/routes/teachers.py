from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, field_validator
from typing import Optional, Union, List
from datetime import datetime, date, time, timedelta
from app.database import get_connection
from app.auth import require_auth, require_teacher
router = APIRouter(prefix="/teachers", tags=["Teachers"])
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
async def sync_group_schedules_with_lessons(pool, group_id: int):
    await pool.execute(
        "DELETE FROM group_schedules WHERE group_id = $1", group_id
    )
    patterns = await pool.fetch(
        """
        SELECT DISTINCT
            EXTRACT(DOW FROM start_time)::int AS day_of_week,
            start_time::time AS lesson_time
        FROM lessons
        WHERE group_id = $1
        ORDER BY day_of_week, lesson_time
        """,
        group_id
    )
    for pattern in patterns:
        await pool.execute(
            """
            INSERT INTO group_schedules (group_id, day_of_week, start_time, is_active)
            VALUES ($1, $2, $3, true)
            """,
            group_id, pattern['day_of_week'], pattern['lesson_time']
        )
def generate_lesson_dates(start_date: date, end_date: date, day_of_week: int, lesson_time: time) -> List[datetime]:
    lessons = []
    current_date = start_date
    days_ahead = day_of_week - current_date.weekday()
    if days_ahead < 0:
        days_ahead += 7
    first_lesson_date = current_date + timedelta(days=days_ahead)
    lesson_date = first_lesson_date
    while lesson_date <= end_date:
        lesson_datetime = datetime.combine(lesson_date, lesson_time)
        lessons.append(lesson_datetime)
        lesson_date += timedelta(weeks=1)
    return lessons
class CreateGroupRequest(BaseModel):
    name: str
    hall_id: int
    start_time: Union[datetime, str]
    capacity: int = 12
    @field_validator('start_time')
    @classmethod
    def parse_start_time(cls, v):
        if isinstance(v, datetime):
            return v
        if isinstance(v, str):
            formats = [
                "%Y-%m-%d %H:%M:%S",
                "%Y-%m-%d %H:%M",
                "%m/%d/%Y %H:%M",
                "%d.%m.%Y %H:%M",
                "%Y-%m-%dT%H:%M:%S",
                "%Y-%m-%dT%H:%M",
            ]
            for fmt in formats:
                try:
                    return datetime.strptime(v, fmt)
                except ValueError:
                    continue
            raise ValueError(f"Invalid datetime format. Supported formats: YYYY-MM-DD HH:MM, MM/DD/YYYY HH:MM, DD.MM.YYYY HH:MM")
        return v
class AdditionalLessonRequest(BaseModel):
    start_time: Union[datetime, str]
    hall_id: Optional[int] = None
    reason: Optional[str] = None
    @field_validator('start_time')
    @classmethod
    def parse_start_time(cls, v):
        if isinstance(v, datetime):
            return v
        if isinstance(v, str):
            formats = [
                "%Y-%m-%d %H:%M:%S",
                "%Y-%m-%d %H:%M",
                "%m/%d/%Y %H:%M",
                "%d.%m.%Y %H:%M",
                "%Y-%m-%dT%H:%M:%S",
                "%Y-%m-%dT%H:%M",
            ]
            for fmt in formats:
                try:
                    return datetime.strptime(v, fmt)
                except ValueError:
                    continue
            raise ValueError(f"Invalid datetime format. Supported formats: YYYY-MM-DD HH:MM, MM/DD/YYYY HH:MM, DD.MM.YYYY HH:MM")
        return v
class AttendanceRequest(BaseModel):
    attended: bool
class SaveLessonAttendanceRequest(BaseModel):
    lesson_date: str
    attendance_records: List[dict]
class GroupNotesRequest(BaseModel):
    notes: str
class RescheduleRequest(BaseModel):
    lesson_id: Optional[int] = None
    group_id: Optional[int] = None
    new_start_time: Union[datetime, str]
    new_hall_id: Optional[int] = None
    reason: Optional[str] = None
    @field_validator('new_start_time')
    @classmethod
    def parse_new_start_time(cls, v):
        if isinstance(v, datetime):
            return v
        if isinstance(v, str):
            formats = [
                "%Y-%m-%d %H:%M:%S",
                "%Y-%m-%d %H:%M",
                "%m/%d/%Y %H:%M",
                "%d.%m.%Y %H:%M",
                "%Y-%m-%dT%H:%M:%S",
                "%Y-%m-%dT%H:%M",
            ]
            for fmt in formats:
                try:
                    return datetime.strptime(v, fmt)
                except ValueError:
                    continue
            raise ValueError(f"Invalid datetime format. Supported formats: YYYY-MM-DD HH:MM, MM/DD/YYYY HH:MM, DD.MM.YYYY HH:MM")
        return v
async def resolve_teacher_id(pool, user_id: int) -> Optional[int]:
    row = await pool.fetchrow(
        "SELECT id FROM teachers WHERE user_id = $1",
        user_id
    )
    if row:
        return row["id"]
    user_row = await pool.fetchrow(
        "SELECT role FROM users WHERE id = $1",
        user_id
    )
    if user_row and user_row["role"] == "teacher":
        teacher_row = await pool.fetchrow(
            "INSERT INTO teachers (user_id) VALUES ($1) RETURNING id",
            user_id
        )
        return teacher_row["id"]
    return None
async def teacher_assigned_to_group(pool, teacher_id: int, group_id: int) -> bool:
    row = await pool.fetchrow(
        """
        SELECT 1 FROM group_teachers WHERE group_id = $1 AND teacher_id = $2
        """,
        group_id, teacher_id
    )
    return row is not None
@router.get("/groups")
async def get_teacher_groups(user: dict = Depends(require_teacher)):
    pool = await get_connection()
    teacher_id = await resolve_teacher_id(pool, user["id"])
    if not teacher_id:
        raise HTTPException(status_code=404, detail="Teacher profile not found")
    rows = await pool.fetch(
        """
        SELECT
            g.id,
            g.name,
            g.duration_minutes,
            g.capacity,
            g.is_closed,
            g.is_trial,
            g.start_date,
            g.recurring_until,
            h.id AS hall_id,
            h.name AS hall_name,
            c.name AS category_name,
            (
                SELECT array_remove(array_agg(DISTINCT u2.name), NULL)
                FROM group_teachers gt2
                LEFT JOIN teachers t2 ON t2.id = gt2.teacher_id
                LEFT JOIN users u2 ON u2.id = t2.user_id
                WHERE gt2.group_id = g.id
            ) AS teacher_names,
            (SELECT COUNT(*) FROM group_students WHERE group_id = g.id) AS enrolled,
            g.notes,
            gt.is_main
        FROM groups g
        INNER JOIN group_teachers gt ON gt.group_id = g.id AND gt.teacher_id = $1
        LEFT JOIN halls h ON h.id = g.hall_id
        LEFT JOIN categories c ON c.id = g.category_id
        ORDER BY g.is_closed ASC, g.name
        """,
        teacher_id
    )
    groups = []
    for r in rows:
        enrolled = int(r["enrolled"]) if r["enrolled"] else 0
        schedule = await get_group_schedule_formatted(pool, r["id"])
        teacher_names = r["teacher_names"] or []
        teacher_display = ", ".join([str(t) for t in teacher_names if t]) or "Не назначен"
        groups.append({
            "id": r["id"],
            "name": r["name"],
            "duration_minutes": r["duration_minutes"],
            "capacity": r["capacity"],
            "is_closed": r["is_closed"],
            "is_main": r["is_main"],
            "category_name": r["category_name"],
            "is_trial": r["is_trial"],
            "start_date": r["start_date"].strftime("%Y-%m-%d") if r["start_date"] else None,
            "end_date": r["recurring_until"].strftime("%Y-%m-%d") if r["recurring_until"] else None,
            "hall": {"id": r["hall_id"], "name": r["hall_name"]} if r["hall_id"] else None,
            "hall_name": r["hall_name"] or "Не указан",
            "teacher_name": teacher_display,
            "teacher_names": [str(t) for t in teacher_names if t],
            "enrolled": enrolled,
            "student_count": enrolled,
            "free_slots": r["capacity"] - enrolled if r["capacity"] else None,
            "schedule": schedule,
            "notes": r["notes"]
        })
    return {"groups": groups}
@router.post("/groups")
async def create_group(data: CreateGroupRequest, user: dict = Depends(require_teacher)):
    pool = await get_connection()
    teacher_id = await resolve_teacher_id(pool, user["id"])
    if not teacher_id:
        raise HTTPException(status_code=404, detail="Teacher profile not found")
    duration = 90
    async with pool.acquire() as conn:
        async with conn.transaction():
            result = await conn.fetchrow(
                """
                INSERT INTO groups (name, hall_id, duration_minutes, capacity)
                VALUES ($1, $2, $3, $4)
                RETURNING id
                """,
                data.name, data.hall_id, duration, data.capacity
            )
            group_id = result["id"]
            await conn.execute(
                """
                INSERT INTO group_teachers (group_id, teacher_id, is_main)
                VALUES ($1, $2, TRUE)
                ON CONFLICT DO NOTHING
                """,
                group_id, teacher_id
            )
    print(f"👨‍🏫 Teacher {teacher_id} created group {group_id}")
    return {"group_id": group_id}

@router.get("/groups/{group_id}")
async def get_group_details(group_id: int, user: dict = Depends(require_teacher)):
    pool = await get_connection()
    teacher_id = await resolve_teacher_id(pool, user["id"])
    if not teacher_id:
        raise HTTPException(status_code=404, detail="Teacher profile not found")
    if not await teacher_assigned_to_group(pool, teacher_id, group_id):
        raise HTTPException(status_code=403, detail="Not assigned to this group")
    row = await pool.fetchrow(
        """
        SELECT
            g.id, g.name, g.duration_minutes, g.capacity,
            g.notes, h.id AS hall_id, h.name AS hall_name
        FROM groups g
        LEFT JOIN halls h ON h.id = g.hall_id
        WHERE g.id = $1
        """,
        group_id
    )
    if not row:
        raise HTTPException(status_code=404, detail="Group not found")
    schedule = await get_group_schedule_formatted(pool, group_id)
    return {
        "id": row["id"],
        "name": row["name"],
        "duration_minutes": row["duration_minutes"],
        "capacity": row["capacity"],
        "schedule": schedule,
        "notes": row["notes"],
        "hall": {"id": row["hall_id"], "name": row["hall_name"]} if row["hall_id"] else None
    }
    
@router.get("/groups/{group_id}/students")
async def get_group_students(group_id: int, user: dict = Depends(require_teacher)):
    pool = await get_connection()
    teacher_id = await resolve_teacher_id(pool, user["id"])
    if not teacher_id:
        raise HTTPException(status_code=404, detail="Teacher profile not found")
    if not await teacher_assigned_to_group(pool, teacher_id, group_id):
        raise HTTPException(status_code=403, detail="Not assigned to this group")
    rows = await pool.fetch(
        """
        SELECT
            s.id, u.name, u.email, s.phone_number, gs.is_trial, gs.joined_at
        FROM group_students gs
        JOIN students s ON s.id = gs.student_id
        JOIN users u ON u.id = s.user_id
        WHERE gs.group_id = $1
        ORDER BY u.name
        """,
        group_id
    )
    students = [
        {
            "id": r["id"],
            "name": r["name"],
            "email": r["email"],
            "phone_number": r["phone_number"],
            "is_trial": r["is_trial"],
            "joined_at": str(r["joined_at"]) if r["joined_at"] else None
        }
        for r in rows
    ]
    return {"students": students}

@router.get("/scheduled-lessons")
async def get_scheduled_lessons(user: dict = Depends(require_teacher)):
    pool = await get_connection()
    teacher_id = await resolve_teacher_id(pool, user["id"])
    if not teacher_id:
        raise HTTPException(status_code=404, detail="Teacher profile not found")
    groups = await pool.fetch(
        """
        SELECT
            g.id, g.name, g.recurring_until,
            h.name AS hall_name
        FROM groups g
        INNER JOIN group_teachers gt ON gt.group_id = g.id AND gt.teacher_id = $1
        LEFT JOIN halls h ON h.id = g.hall_id
        WHERE g.is_closed = FALSE
        AND g.recurring_until IS NOT NULL
        """,
        teacher_id
    )
    scheduled_lessons = []
    for group in groups:
        schedule_rows = await pool.fetch(
            """
            SELECT day_of_week, start_time
            FROM group_schedules
            WHERE group_id = $1 AND is_active = TRUE
            ORDER BY day_of_week
            """,
            group["id"]
        )
        students = await pool.fetch(
            """
            SELECT s.id, u.name
            FROM group_students gs
            JOIN students s ON s.id = gs.student_id
            JOIN users u ON u.id = s.user_id
            WHERE gs.group_id = $1
            ORDER BY u.name
            """,
            group["id"]
        )
        for schedule in schedule_rows:
            day_of_week = schedule["day_of_week"]
            lesson_time = schedule["start_time"]
            python_weekday = (day_of_week - 1) % 7
            from datetime import date as date_type
            start_date = date_type.today()
            lesson_dates = generate_lesson_dates(
                start_date,
                group["recurring_until"],
                python_weekday,
                lesson_time
            )
            for lesson_datetime in lesson_dates:
                attendance_records = await pool.fetch(
                    """
                    SELECT ar.student_id, ar.attended
                    FROM attendance_records ar
                    WHERE ar.group_id = $1
                    AND ar.teacher_id = $2
                    AND DATE(ar.recorded_at) = $3
                    """,
                    group["id"], teacher_id, lesson_datetime.date()
                )
                attendance_dict = {record["student_id"]: record["attended"] for record in attendance_records}
                student_attendance = []
                for student in students:
                    student_attendance.append({
                        "studentId": student["id"],
                        "studentName": student["name"],
                        "attendance": attendance_dict.get(student["id"])
                    })
                scheduled_lessons.append({
                    "groupId": group["id"],
                    "groupName": group["name"],
                    "lessonDate": lesson_datetime.strftime("%Y-%m-%d"),
                    "lessonTime": lesson_datetime.strftime("%H:%M"),
                    "lessonDateTime": lesson_datetime.isoformat(),
                    "hallName": group["hall_name"] or "Не указан",
                    "students": student_attendance,
                    "isCompleted": len(attendance_dict) > 0
                })
    scheduled_lessons.sort(key=lambda x: x["lessonDateTime"])
    return {"lessons": scheduled_lessons}


@router.get("/schedule/weekly")
async def get_teacher_weekly_schedule(
    week_start: str,
    user: dict = Depends(require_teacher),
):
    from datetime import datetime, timedelta

    pool = await get_connection()
    teacher_id = await resolve_teacher_id(pool, user["id"])
    if not teacher_id:
        raise HTTPException(status_code=404, detail="Teacher profile not found")

    try:
        week_start_date = datetime.strptime(week_start, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    week_end_date = week_start_date + timedelta(days=6)

    lessons = await pool.fetch(
        """
        SELECT
            l.id as lesson_id,
            l.group_id,
            l.class_name,
            l.duration_minutes,
            l.start_time,
            l.is_cancelled,
            l.is_rescheduled,
            g.name as group_name,
            h.id as hall_id,
            h.name as hall_name
        FROM lessons l
        JOIN groups g ON g.id = l.group_id
        LEFT JOIN halls h ON h.id = l.hall_id
        WHERE DATE(l.start_time) BETWEEN $1 AND $2
          AND (
            l.teacher_id = $3
            OR l.substitute_teacher_id = $3
            OR EXISTS (
                SELECT 1 FROM group_teachers gt
                WHERE gt.group_id = l.group_id AND gt.teacher_id = $3
            )
          )
        ORDER BY l.start_time
        """,
        week_start_date,
        week_end_date,
        teacher_id,
    )

    entries = []
    for lesson in lessons:
        start_datetime = lesson["start_time"]
        if hasattr(start_datetime, 'tzinfo') and start_datetime.tzinfo is not None:
            from datetime import timezone
            local_tz = timezone(timedelta(hours=5))
            start_datetime = start_datetime.astimezone(local_tz).replace(tzinfo=None)

        duration = int(lesson["duration_minutes"] or 60)
        end_datetime = start_datetime + timedelta(minutes=duration)

        date = start_datetime.date()
        day_index = date.weekday()  # Monday=0

        entries.append({
            "lessonId": lesson["lesson_id"],
            "groupId": lesson["group_id"],
            "groupName": lesson["group_name"],
            "className": lesson["class_name"] or "",
            "dayIndex": day_index,
            "date": date.isoformat(),
            "startTime": start_datetime.strftime("%H:%M"),
            "endTime": end_datetime.strftime("%H:%M"),
            "duration": duration,
            "hallId": lesson["hall_id"],
            "hallName": lesson["hall_name"] or "Не назначен",
            "isCancelled": bool(lesson["is_cancelled"]),
            "isRescheduled": bool(lesson["is_rescheduled"]),
            "status": "Отменён" if lesson["is_cancelled"] else ("Перенесён" if lesson["is_rescheduled"] else None),
        })

    entries.sort(key=lambda x: (x["dayIndex"], x["startTime"]))

    return {
        "weekStart": week_start,
        "weekEnd": week_end_date.isoformat(),
        "entries": entries,
    }


@router.get("/halls/occupancy/weekly")
async def get_halls_occupancy_weekly(
    week_start: str,
    user: dict = Depends(require_teacher),
):
    from datetime import datetime, timedelta

    pool = await get_connection()
    try:
        week_start_date = datetime.strptime(week_start, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    week_end_date = week_start_date + timedelta(days=6)

    lesson_rows = await pool.fetch(
        """
        SELECT
            l.hall_id,
            h.name as hall_name,
            l.start_time,
            l.duration_minutes,
            l.is_cancelled
        FROM lessons l
        JOIN halls h ON h.id = l.hall_id
        WHERE l.hall_id IS NOT NULL
          AND DATE(l.start_time) BETWEEN $1 AND $2
          AND (l.is_cancelled IS NULL OR l.is_cancelled = FALSE)
        ORDER BY h.name, l.start_time
        """,
        week_start_date,
        week_end_date,
    )

    hours = list(range(8, 22))  # 8..21
    halls: dict[int, dict] = {}

    def overlaps(slot_start: datetime, slot_end: datetime, lesson_start: datetime, lesson_end: datetime) -> bool:
        return lesson_start < slot_end and lesson_end > slot_start

    for row in lesson_rows:
        hall_id = int(row["hall_id"])
        hall_name = row["hall_name"]

        if hall_id not in halls:
            halls[hall_id] = {
                "id": hall_id,
                "name": hall_name,
                "occupied": [[False for _ in hours] for _ in range(7)],
            }

        start_datetime = row["start_time"]
        if hasattr(start_datetime, 'tzinfo') and start_datetime.tzinfo is not None:
            from datetime import timezone
            local_tz = timezone(timedelta(hours=5))
            start_datetime = start_datetime.astimezone(local_tz).replace(tzinfo=None)

        duration = int(row["duration_minutes"] or 60)
        end_datetime = start_datetime + timedelta(minutes=duration)

        day_index = start_datetime.date().weekday()
        if day_index < 0 or day_index > 6:
            continue

        for hour_idx, hour in enumerate(hours):
            slot_start = datetime.combine(start_datetime.date(), time(hour=hour, minute=0))
            slot_end = slot_start + timedelta(hours=1)
            if overlaps(slot_start, slot_end, start_datetime, end_datetime):
                halls[hall_id]["occupied"][day_index][hour_idx] = True

    return {
        "weekStart": week_start,
        "weekEnd": week_end_date.isoformat(),
        "hours": hours,
        "halls": sorted(halls.values(), key=lambda h: h["name"]),
    }
@router.post("/groups/{group_id}/attendance")
async def save_lesson_attendance(group_id: int, data: SaveLessonAttendanceRequest, user: dict = Depends(require_teacher)):
    pool = await get_connection()
    teacher_id = await resolve_teacher_id(pool, user["id"])
    if not teacher_id:
        raise HTTPException(status_code=404, detail="Teacher profile not found")
    if not await teacher_assigned_to_group(pool, teacher_id, group_id):
        raise HTTPException(status_code=403, detail="Not assigned to this group")
    try:
        lesson_date = datetime.strptime(data.lesson_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                """
                DELETE FROM attendance_records
                WHERE group_id = $1 AND teacher_id = $2 AND DATE(recorded_at) = $3
                """,
                group_id, teacher_id, lesson_date
            )
            for record in data.attendance_records:
                student_id = record["student_id"]
                status = record["status"]
                attended = status == "P"
                await conn.execute(
                    """
                    INSERT INTO attendance_records (group_id, student_id, teacher_id, attended, recorded_at)
                    VALUES ($1, $2, $3, $4, $5)
                    """,
                    group_id, student_id, teacher_id, attended, datetime.combine(lesson_date, datetime.now().time())
                )
    return {"message": "Attendance saved successfully"}

@router.post("/groups/{group_id}/extra-lessons")
async def create_additional_lesson(group_id: int, data: AdditionalLessonRequest, user: dict = Depends(require_teacher)):
    pool = await get_connection()
    teacher_id = await resolve_teacher_id(pool, user["id"])
    if not teacher_id:
        raise HTTPException(status_code=404, detail="Teacher profile not found")
    if not await teacher_assigned_to_group(pool, teacher_id, group_id):
        raise HTTPException(status_code=403, detail="Not assigned to this group")
    group_info = await pool.fetchrow(
        "SELECT hall_id, duration_minutes FROM groups WHERE id = $1",
        group_id
    )
    if not group_info:
        raise HTTPException(status_code=404, detail="Group not found")
    hall_id = data.hall_id or group_info["hall_id"]
    duration = 90
    result = await pool.fetchrow(
        """
        INSERT INTO schedule_exceptions (
            group_id, teacher_id, hall_id, start_time, duration_minutes,
            reason, additional, approved, requested_by_student
        ) VALUES ($1, $2, $3, $4, $5, $6, TRUE, TRUE, FALSE)
        RETURNING id
        """,
        group_id, teacher_id, hall_id, data.start_time, duration, data.reason
    )
    print(f"📅 Teacher {teacher_id} created additional lesson {result['id']} for group {group_id}")
    return {"additional_lesson_id": result["id"]}

@router.post("/groups/{group_id}/students/{student_id}/attendance")
async def mark_attendance(group_id: int, student_id: int, data: AttendanceRequest, user: dict = Depends(require_teacher)):
    pool = await get_connection()
    teacher_id = await resolve_teacher_id(pool, user["id"])
    if not teacher_id:
        raise HTTPException(status_code=404, detail="Teacher profile not found")
    if not await teacher_assigned_to_group(pool, teacher_id, group_id):
        raise HTTPException(status_code=403, detail="Not assigned to this group")
    await pool.execute(
        """
        INSERT INTO attendance_records (group_id, student_id, teacher_id, attended)
        VALUES ($1, $2, $3, $4)
        """,
        group_id, student_id, teacher_id, data.attended
    )
    return {"message": "Attendance recorded"}

@router.post("/groups/{group_id}/notes")
async def save_group_notes(group_id: int, data: GroupNotesRequest, user: dict = Depends(require_teacher)):
    pool = await get_connection()
    teacher_id = await resolve_teacher_id(pool, user["id"])
    if not teacher_id:
        raise HTTPException(status_code=404, detail="Teacher profile not found")
    if not await teacher_assigned_to_group(pool, teacher_id, group_id):
        raise HTTPException(status_code=403, detail="Not assigned to this group")
    await pool.execute(
        "UPDATE groups SET notes = $1 WHERE id = $2",
        data.notes, group_id
    )
    return {"message": "Notes saved"}

@router.get("/attendance/average")
async def get_attendance_summary(user: dict = Depends(require_teacher)):
    pool = await get_connection()
    teacher_id = await resolve_teacher_id(pool, user["id"])
    if not teacher_id:
        raise HTTPException(status_code=404, detail="Teacher profile not found")
    rows = await pool.fetch(
        """
        SELECT
            g.id,
            g.name,
            COUNT(ar.id) AS total_records,
            SUM(CASE WHEN ar.attended THEN 1 ELSE 0 END) AS attended_count
        FROM groups g
        INNER JOIN group_teachers gt ON gt.group_id = g.id AND gt.teacher_id = $1
        LEFT JOIN attendance_records ar ON ar.group_id = g.id
        GROUP BY g.id, g.name
        """,
        teacher_id
    )
    summary = []
    for r in rows:
        total = int(r["total_records"]) if r["total_records"] else 0
        attended = int(r["attended_count"]) if r["attended_count"] else 0
        avg = (attended / total * 100) if total > 0 else None
        summary.append({
            "group_id": r["id"],
            "group_name": r["name"],
            "total_lessons": total,
            "average_attendance": round(avg, 1) if avg else None
        })
    return {"summary": summary}

@router.post("/reschedule-request")
async def submit_reschedule_request(data: RescheduleRequest, user: dict = Depends(require_teacher)):
    pool = await get_connection()
    teacher_id = await resolve_teacher_id(pool, user["id"])
    if not teacher_id:
        raise HTTPException(status_code=404, detail="Teacher profile not found")
    lesson_id = data.lesson_id
    group_id = data.group_id
    if not lesson_id and group_id:
        if not await teacher_assigned_to_group(pool, teacher_id, group_id):
            raise HTTPException(status_code=403, detail="Not assigned to this group")
        existing_lesson = await pool.fetchrow(
            """
            SELECT id FROM lessons
            WHERE group_id = $1 AND start_time > NOW()
            ORDER BY start_time ASC
            LIMIT 1
            """,
            group_id
        )
        if existing_lesson:
            lesson_id = existing_lesson["id"]
        else:
            group = await pool.fetchrow(
                "SELECT hall_id, duration_minutes FROM groups WHERE id = $1",
                group_id
            )
            if not group:
                raise HTTPException(status_code=404, detail="Group not found")
            new_lesson = await pool.fetchrow(
                """
                INSERT INTO lessons (group_id, teacher_id, hall_id, start_time, duration_minutes)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id
                """,
                group_id, teacher_id, group["hall_id"], data.new_start_time, group["duration_minutes"] or 60
            )
            lesson_id = new_lesson["id"]
    if not lesson_id:
        raise HTTPException(status_code=400, detail="Either lesson_id or group_id must be provided")
    lesson_info = await pool.fetchrow(
        """
        SELECT l.id, l.start_time, g.id as group_id, g.name as group_name
        FROM lessons l
        JOIN groups g ON l.group_id = g.id
        WHERE l.id = $1
        """,
        lesson_id
    )
    if not lesson_info:
        raise HTTPException(status_code=404, detail="Lesson not found")
    result = await pool.fetchrow(
        """
        INSERT INTO reschedule_requests (
            lesson_id, teacher_id, requested_by_user_id, new_start_time, new_hall_id, reason, status, original_time
        ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
        RETURNING id
        """,
        lesson_id, teacher_id, user["id"], data.new_start_time, data.new_hall_id, data.reason, lesson_info["start_time"]
    )
    teacher_info = await pool.fetchrow(
        "SELECT u.name FROM teachers t JOIN users u ON t.user_id = u.id WHERE t.id = $1",
        teacher_id
    )
    teacher_name = teacher_info["name"] if teacher_info else "Преподаватель"
    new_time_str = data.new_start_time.strftime("%d.%m.%Y %H:%M") if data.new_start_time else "не указано"
    from app.notifications import notify_admins, NotificationType
    await notify_admins(
        notification_type=NotificationType.RESCHEDULE_REQUEST_SUBMITTED,
        title="Новая заявка на перенос",
        message=f"{teacher_name} подал(а) заявку на перенос занятия группы '{lesson_info['group_name']}' на {new_time_str}",
        group_id=lesson_info["group_id"],
        related_id=result["id"],
        related_type="reschedule_request",
        action_url="/analytics/applications"
    )
    return {"request_id": result["id"], "message": "Reschedule request submitted"}

@router.get("/groups/{group_id}")
async def get_teacher_group_details(group_id: int, user: dict = Depends(require_teacher)):
    """Get detailed information about a specific group for a teacher."""
    pool = await get_connection()
    teacher_id = await resolve_teacher_id(pool, user["id"])
    if not teacher_id:
        raise HTTPException(status_code=404, detail="Teacher profile not found")
    has_access = await pool.fetchval(
        """
        SELECT EXISTS(
            SELECT 1 FROM group_teachers gt WHERE gt.group_id = $1 AND gt.teacher_id = $2
        )
        """,
        group_id, teacher_id
    )
    if not has_access:
        raise HTTPException(status_code=403, detail="Access denied to this group")
    row = await pool.fetchrow(
        """
        SELECT
            g.id, g.name, g.capacity, g.duration_minutes, g.is_closed, g.notes,
            g.recurring_until,
            h.id AS hall_id, h.name AS hall_name,
            u.name AS teacher_name,
            gt.is_main
        FROM groups g
        LEFT JOIN halls h ON h.id = g.hall_id
        LEFT JOIN group_teachers gt ON gt.group_id = g.id AND gt.is_main = TRUE
        LEFT JOIN teachers t ON t.id = gt.teacher_id
        LEFT JOIN users u ON u.id = t.user_id
        WHERE g.id = $1
        """,
        group_id
    )
    if not row:
        raise HTTPException(status_code=404, detail="Group not found")
    schedule = await get_group_schedule_formatted(pool, group_id)
    return {
        "id": row["id"],
        "name": row["name"],
        "capacity": row["capacity"],
        "duration_minutes": row["duration_minutes"],
        "is_closed": row["is_closed"],
        "notes": row["notes"] or "",
        "hall_name": row["hall_name"] or "Не указан",
        "teacher_name": row["teacher_name"] or "Не назначен",
        "schedule": schedule,
        "recurring_until": str(row["recurring_until"]) if row["recurring_until"] else None
    }
@router.get("/groups/{group_id}/students")

async def get_teacher_group_students(group_id: int, user: dict = Depends(require_teacher)):
    pool = await get_connection()
    teacher_id = await resolve_teacher_id(pool, user["id"])
    if not teacher_id:
        raise HTTPException(status_code=404, detail="Teacher profile not found")
    has_access = await pool.fetchval(
        """
        SELECT EXISTS(
            SELECT 1 FROM group_teachers gt WHERE gt.group_id = $1 AND gt.teacher_id = $2
        )
        """,
        group_id, teacher_id
    )
    if not has_access:
        raise HTTPException(status_code=403, detail="Access denied to this group")
    rows = await pool.fetch(
        """
        SELECT
            s.id,
            u.name,
            u.email,
            gs.joined_at,
            (SELECT COUNT(*) FROM attendance_records ar WHERE ar.student_id = s.id AND ar.group_id = $1 AND ar.attended = TRUE) AS attended_count,
            (SELECT COUNT(*) FROM attendance_records ar WHERE ar.student_id = s.id AND ar.group_id = $1) AS total_records
        FROM group_students gs
        JOIN students s ON s.id = gs.student_id
        JOIN users u ON u.id = s.user_id
        WHERE gs.group_id = $1
        ORDER BY u.name
        """,
        group_id
    )
    students = []
    for r in rows:
        total = int(r["total_records"]) if r["total_records"] else 0
        attended = int(r["attended_count"]) if r["attended_count"] else 0
        rate = (attended / total * 100) if total > 0 else 0
        students.append({
            "id": r["id"],
            "name": r["name"],
            "email": r["email"],
            "joined_at": str(r["joined_at"]) if r["joined_at"] else None,
            "attendance_rate": round(rate, 1),
            "last_attendance": None,
            "status": "active"
        })
    return {"students": students}

@router.get("/groups/{group_id}/stats")
async def get_teacher_group_stats(group_id: int, user: dict = Depends(require_teacher)):
    pool = await get_connection()
    teacher_id = await resolve_teacher_id(pool, user["id"])
    if not teacher_id:
        raise HTTPException(status_code=404, detail="Teacher profile not found")
    has_access = await pool.fetchval(
        """
        SELECT EXISTS(
            SELECT 1 FROM group_teachers gt WHERE gt.group_id = $1 AND gt.teacher_id = $2
        )
        """,
        group_id, teacher_id
    )
    if not has_access:
        raise HTTPException(status_code=403, detail="Access denied to this group")
    student_count = await pool.fetchval(
        "SELECT COUNT(*) FROM group_students WHERE group_id = $1",
        group_id
    ) or 0
    active_students = await pool.fetchval(
        """
        SELECT COUNT(DISTINCT ar.student_id)
        FROM attendance_records ar
        JOIN lessons l ON l.id = ar.lesson_id
        WHERE ar.group_id = $1
          AND ar.attended = TRUE
          AND (l.start_time AT TIME ZONE 'Asia/Almaty')::date >= (NOW() AT TIME ZONE 'Asia/Almaty')::date - INTERVAL '30 days'
        """,
        group_id
    ) or 0
    attendance_stats = await pool.fetchrow(
        """
        SELECT
            COUNT(*) AS total_records,
            SUM(CASE WHEN attended THEN 1 ELSE 0 END) AS attended_count
        FROM attendance_records ar
        JOIN lessons l ON l.id = ar.lesson_id
        WHERE ar.group_id = $1
          AND l.is_cancelled = FALSE
        """,
        group_id
    )
    total = int(attendance_stats["total_records"]) if attendance_stats and attendance_stats["total_records"] else 0
    attended = int(attendance_stats["attended_count"]) if attendance_stats and attendance_stats["attended_count"] else 0
    avg_attendance = (attended / total * 100) if total > 0 else 0
    conducted_lessons = await pool.fetchval(
        """
        SELECT COUNT(*) FROM lessons
        WHERE group_id = $1
          AND (start_time AT TIME ZONE 'Asia/Almaty')::date < (NOW() AT TIME ZONE 'Asia/Almaty')::date
          AND is_cancelled = FALSE
        """,
        group_id
    ) or 0
    upcoming_lessons = await pool.fetchval(
        """
        SELECT COUNT(*) FROM lessons
        WHERE group_id = $1
          AND (start_time AT TIME ZONE 'Asia/Almaty')::date >= (NOW() AT TIME ZONE 'Asia/Almaty')::date
          AND is_cancelled = FALSE
        """,
        group_id
    ) or 0
    return {
        "stats": {
            "total_students": int(student_count),
            "active_students": int(active_students),
            "average_attendance": round(avg_attendance, 1),
            "total_lessons": int(conducted_lessons),
            "upcoming_lessons": int(upcoming_lessons)
        }
    }

@router.get("/groups/{group_id}/lessons")
async def get_teacher_group_lessons(group_id: int, user: dict = Depends(require_teacher)):
    pool = await get_connection()
    teacher_id = await resolve_teacher_id(pool, user["id"])
    if not teacher_id:
        raise HTTPException(status_code=404, detail="Teacher profile not found")
    has_access = await pool.fetchval(
        """
        SELECT EXISTS(
            SELECT 1 FROM group_teachers gt WHERE gt.group_id = $1 AND gt.teacher_id = $2
        )
        """,
        group_id, teacher_id
    )
    if not has_access:
        raise HTTPException(status_code=403, detail="Access denied to this group")
    lesson_rows = await pool.fetch(
        """
        SELECT
            l.id,
            l.class_name,
            l.start_time,
            l.duration_minutes,
            l.is_cancelled,
            h.name AS hall_name
        FROM lessons l
        LEFT JOIN halls h ON h.id = l.hall_id
        WHERE l.group_id = $1
        ORDER BY l.start_time DESC
        LIMIT 20
        """,
        group_id
    )
    lessons = []
    for lesson in lesson_rows:
        attendance_rows = await pool.fetch(
            """
            SELECT
                ar.id,
                ar.student_id,
                u.name AS student_name,
                ar.attended,
                ar.recorded_at
            FROM attendance_records ar
            JOIN students s ON s.id = ar.student_id
            JOIN users u ON u.id = s.user_id
            WHERE ar.group_id = $1 AND DATE(ar.recorded_at) = DATE($2)
            ORDER BY u.name
            """,
            group_id, lesson["start_time"]
        )
        attendance_records = [
            {
                "id": ar["id"],
                "student_id": ar["student_id"],
                "student_name": ar["student_name"],
                "attended": ar["attended"],
                "status": "P" if ar["attended"] else "A",
                "recorded_at": str(ar["recorded_at"]) if ar["recorded_at"] else None
            }
            for ar in attendance_rows
        ]
        lessons.append({
            "id": lesson["id"],
            "class_name": lesson["class_name"],
            "lesson_date": str(lesson["start_time"].date()) if lesson["start_time"] else None,
            "start_time": str(lesson["start_time"]) if lesson["start_time"] else None,
            "duration_minutes": lesson["duration_minutes"],
            "hall_name": lesson["hall_name"] or "Не указан",
            "is_cancelled": lesson["is_cancelled"],
            "attendance_records": attendance_records
        })
    return {"lessons": lessons}
@router.put("/groups/{group_id}/notes")
async def save_teacher_group_notes(group_id: int, data: dict, user: dict = Depends(require_teacher)):
    pool = await get_connection()
    teacher_id = await resolve_teacher_id(pool, user["id"])
    if not teacher_id:
        raise HTTPException(status_code=404, detail="Teacher profile not found")
    has_access = await pool.fetchval(
        """
        SELECT EXISTS(
            SELECT 1 FROM group_teachers gt WHERE gt.group_id = $1 AND gt.teacher_id = $2
        )
        """,
        group_id, teacher_id
    )
    if not has_access:
        raise HTTPException(status_code=403, detail="Access denied to this group")
    notes = data.get("notes", "")
    await pool.execute(
        "UPDATE groups SET notes = $1 WHERE id = $2",
        notes, group_id
    )
    return {"message": "Notes saved"}

@router.post("/groups/{group_id}/lessons/{lesson_id}/attendance")
async def save_teacher_lesson_attendance(
    group_id: int,
    lesson_id: int,
    attendance_data: dict,
    user: dict = Depends(require_teacher)
):
    pool = await get_connection()
    teacher_id = await resolve_teacher_id(pool, user["id"])
    if not teacher_id:
        raise HTTPException(status_code=404, detail="Teacher profile not found")
    has_access = await pool.fetchval(
        """
        SELECT EXISTS(
            SELECT 1 FROM group_teachers gt WHERE gt.group_id = $1 AND gt.teacher_id = $2
        )
        """,
        group_id, teacher_id
    )
    if not has_access:
        raise HTTPException(status_code=403, detail="Access denied to this group")
    try:
        attendance_records = attendance_data.get('attendance', [])
        for record in attendance_records:
            student_id = record['student_id']
            status = record['status']
            attended = status in ['P', 'E', 'L']
            existing_record = await pool.fetchrow(
                "SELECT id FROM attendance_records WHERE lesson_id = $1 AND student_id = $2",
                lesson_id, student_id
            )
            if existing_record:
                await pool.execute(
                    """
                    UPDATE attendance_records
                    SET status = $1, attended = $2, teacher_id = $3, recorded_at = CURRENT_TIMESTAMP
                    WHERE lesson_id = $4 AND student_id = $5
                    """,
                    status, attended, teacher_id, lesson_id, student_id
                )
            else:
                await pool.execute(
                    """
                    INSERT INTO attendance_records (group_id, student_id, teacher_id, attended, lesson_id, status, recorded_at)
                    VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
                    """,
                    group_id, student_id, teacher_id, attended, lesson_id, status
                )
        return {"message": "Attendance saved successfully"}
    except Exception as e:
        print(f"Error saving attendance: {e}")
        raise HTTPException(status_code=500, detail="Failed to save attendance")
@router.delete("/lessons/{lesson_id}")
async def delete_teacher_lesson(lesson_id: int, user: dict = Depends(require_teacher)):
    pool = await get_connection()
    teacher_id = await resolve_teacher_id(pool, user["id"])
    if not teacher_id:
        raise HTTPException(status_code=404, detail="Teacher profile not found")
    lesson = await pool.fetchrow(
        """
        SELECT l.group_id FROM lessons l
        JOIN group_teachers gt ON gt.group_id = l.group_id
        WHERE l.id = $1 AND gt.teacher_id = $2
        """,
        lesson_id, teacher_id
    )
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found or access denied")
    try:
        await pool.execute(
            "DELETE FROM attendance_records WHERE lesson_id = $1",
            lesson_id
        )
        group_id = await pool.fetchval(
            "SELECT group_id FROM lessons WHERE id = $1", lesson_id
        )
        await pool.execute(
            "DELETE FROM lessons WHERE id = $1",
            lesson_id
        )
        if group_id:
            await sync_group_schedules_with_lessons(pool, group_id)
        return {"message": "Lesson deleted successfully"}
    except Exception as e:
        print(f"Error deleting lesson: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete lesson")
@router.put("/lessons/{lesson_id}")
async def update_teacher_lesson(lesson_id: int, lesson_data: dict, user: dict = Depends(require_teacher)):
    """Update a lesson (teacher version of admin endpoint)."""
    pool = await get_connection()
    teacher_id = await resolve_teacher_id(pool, user["id"])
    if not teacher_id:
        raise HTTPException(status_code=404, detail="Teacher profile not found")
    lesson = await pool.fetchrow(
        """
        SELECT l.group_id FROM lessons l
        JOIN group_teachers gt ON gt.group_id = l.group_id
        WHERE l.id = $1 AND gt.teacher_id = $2
        """,
        lesson_id, teacher_id
    )
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found or access denied")
    try:
        start_time = datetime.fromisoformat(lesson_data['start_time'])
        end_time = datetime.fromisoformat(lesson_data['end_time'])
        duration_minutes = int((end_time - start_time).total_seconds() / 60)
        await pool.execute(
            """
            UPDATE lessons
            SET class_name = $1, start_time = $2, duration_minutes = $3
            WHERE id = $4
            """,
            lesson_data['class_name'], start_time, duration_minutes, lesson_id
        )
        return {"message": "Lesson updated successfully"}
    except Exception as e:
        print(f"Error updating lesson: {e}")
        raise HTTPException(status_code=500, detail="Failed to update lesson")
@router.get("/groups/{group_id}/lessons-attendance")
async def get_teacher_lessons_with_attendance(group_id: int, user: dict = Depends(require_teacher)):
    pool = await get_connection()
    teacher_id = await resolve_teacher_id(pool, user["id"])
    if not teacher_id:
        raise HTTPException(status_code=404, detail="Teacher profile not found")
    group = await pool.fetchrow(
        """
        SELECT g.* FROM groups g
        JOIN group_teachers gt ON gt.group_id = g.id
        WHERE g.id = $1 AND gt.teacher_id = $2
        """,
        group_id, teacher_id
    )
    if not group:
        raise HTTPException(status_code=404, detail="Group not found or access denied")
    lessons = await pool.fetch(
        """
        SELECT
            l.id,
            l.class_name,
            l.start_time,
            l.duration_minutes,
            l.is_cancelled,
            h.name as hall_name,
            u.name as teacher_name,
            COUNT(gs.student_id) as total_students,
            COUNT(CASE WHEN ar.status = 'P' THEN 1 END) as present_count,
            COUNT(CASE WHEN ar.status = 'E' THEN 1 END) as excused_count,
            COUNT(CASE WHEN ar.status = 'L' THEN 1 END) as late_count,
            COUNT(CASE WHEN ar.status = 'A' THEN 1 END) as absent_count
        FROM lessons l
        LEFT JOIN halls h ON h.id = l.hall_id
        LEFT JOIN teachers t ON t.id = l.teacher_id
        LEFT JOIN users u ON u.id = t.user_id
        LEFT JOIN group_students gs ON gs.group_id = l.group_id
        LEFT JOIN attendance_records ar ON ar.lesson_id = l.id AND ar.student_id = gs.student_id
        WHERE l.group_id = $1
        GROUP BY l.id, l.class_name, l.start_time, l.duration_minutes, l.is_cancelled, h.name, u.name
        ORDER BY l.start_time DESC
        """,
        group_id
    )
    return {"lessons": [dict(lesson) for lesson in lessons]}
@router.get("/groups/{group_id}/lessons/{lesson_id}/attendance")
async def get_teacher_lesson_attendance(group_id: int, lesson_id: int, user: dict = Depends(require_teacher)):
    pool = await get_connection()
    teacher_id = await resolve_teacher_id(pool, user["id"])
    if not teacher_id:
        raise HTTPException(status_code=404, detail="Teacher profile not found")
    group = await pool.fetchrow(
        """
        SELECT g.* FROM groups g
        JOIN group_teachers gt ON gt.group_id = g.id
        WHERE g.id = $1 AND gt.teacher_id = $2
        """,
        group_id, teacher_id
    )
    if not group:
        raise HTTPException(status_code=404, detail="Group not found or access denied")
    students = await pool.fetch(
        """
        SELECT
            s.id,
            u.name,
            u.email,
            ar.status,
            ar.recorded_at
        FROM group_students gs
        JOIN students s ON s.id = gs.student_id
        JOIN users u ON u.id = s.user_id
        LEFT JOIN attendance_records ar ON ar.student_id = s.id AND ar.lesson_id = $1
        WHERE gs.group_id = $2
        ORDER BY u.name
        """,
        lesson_id, group_id
    )
    return {"students": [dict(student) for student in students]}
@router.post("/groups/{group_id}/lessons/{lesson_id}/attendance")
async def save_teacher_lesson_attendance(
    group_id: int,
    lesson_id: int,
    attendance_data: dict,
    user: dict = Depends(require_teacher)
):
    pool = await get_connection()
    teacher_id = await resolve_teacher_id(pool, user["id"])
    if not teacher_id:
        raise HTTPException(status_code=404, detail="Teacher profile not found")
    group = await pool.fetchrow(
        """
        SELECT g.* FROM groups g
        JOIN group_teachers gt ON gt.group_id = g.id
        WHERE g.id = $1 AND gt.teacher_id = $2
        """,
        group_id, teacher_id
    )
    if not group:
        raise HTTPException(status_code=404, detail="Group not found or access denied")
    try:
        attendance_records = attendance_data.get('attendance', [])
        for record in attendance_records:
            student_id = record['student_id']
            status = record['status']
            await pool.execute(
                """
                INSERT INTO attendance_records (group_id, student_id, teacher_id, lesson_id, status, recorded_at)
                VALUES ($1, $2, $3, $4, $5, NOW())
                ON CONFLICT (lesson_id, student_id)
                DO UPDATE SET
                    status = EXCLUDED.status,
                    teacher_id = EXCLUDED.teacher_id,
                    recorded_at = EXCLUDED.recorded_at
                """,
                group_id, student_id, teacher_id, lesson_id, status
            )
        return {"message": "Attendance saved successfully"}
    except Exception as e:
        print(f"Error saving attendance: {e}")
        raise HTTPException(status_code=500, detail="Failed to save attendance")
@router.post("/groups/{group_id}/lessons")
async def create_teacher_lesson(
    group_id: int,
    lesson_data: dict,
    user: dict = Depends(require_teacher)
):
    pool = await get_connection()
    teacher_id = await resolve_teacher_id(pool, user["id"])
    if not teacher_id:
        raise HTTPException(status_code=404, detail="Teacher profile not found")
    group = await pool.fetchrow(
        """
        SELECT g.* FROM groups g
        JOIN group_teachers gt ON gt.group_id = g.id
        WHERE g.id = $1 AND gt.teacher_id = $2
        """,
        group_id, teacher_id
    )
    if not group:
        raise HTTPException(status_code=404, detail="Group not found or access denied")
    try:
        start_time = datetime.fromisoformat(lesson_data['start_time'])
        end_time = datetime.fromisoformat(lesson_data['end_time'])
        duration_minutes = int((end_time - start_time).total_seconds() / 60)
        lesson_id = await pool.fetchval(
            """
            INSERT INTO lessons (group_id, class_name, teacher_id, hall_id, start_time, duration_minutes)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
            """,
            group_id,
            lesson_data.get('class_name', 'Новое занятие'),
            teacher_id,
            lesson_data.get('hall_id'),
            start_time,
            duration_minutes
        )
        return {"message": "Lesson created successfully", "lesson_id": lesson_id}
    except Exception as e:
        print(f"Error creating lesson: {e}")
        raise HTTPException(status_code=500, detail="Failed to create lesson")
