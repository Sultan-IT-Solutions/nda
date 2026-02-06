from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, field_validator
from typing import Optional, List, Union
from datetime import datetime, time
from app.database import get_connection
from app.auth import require_admin, require_admin_or_teacher
router = APIRouter(prefix="/admin", tags=["Admin"])
DAY_NAMES_BY_NUM = {
    0: "Вс",
    1: "Пн",
    2: "Вт",
    3: "Ср",
    4: "Чт",
    5: "Пт",
    6: "Сб"
}
DAY_NAME_TO_NUM = {
    "sunday": 0,
    "monday": 1,
    "tuesday": 2,
    "wednesday": 3,
    "thursday": 4,
    "friday": 5,
    "saturday": 6
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
            ON CONFLICT (group_id, day_of_week) DO UPDATE SET start_time = $3, is_active = true
            """,
            group_id, pattern['day_of_week'], pattern['lesson_time']
        )
async def save_group_schedule(pool, group_id: int, schedules: dict):
    await pool.execute("DELETE FROM group_schedules WHERE group_id = $1", group_id)
    for day_name, time_str in schedules.items():
        if not time_str or not time_str.strip():
            continue
        day_num = DAY_NAME_TO_NUM.get(day_name.lower())
        if day_num is None:
            continue
        try:
            hours, minutes = map(int, time_str.strip().split(":"))
            start_time = time(hours, minutes)
        except (ValueError, AttributeError):
            continue
        await pool.execute(
            """
            INSERT INTO group_schedules (group_id, day_of_week, start_time, is_active)
            VALUES ($1, $2, $3, TRUE)
            ON CONFLICT (group_id, day_of_week) DO UPDATE SET start_time = $3, is_active = TRUE
            """,
            group_id, day_num, start_time
        )

class CreateHallRequest(BaseModel):
    name: str
    capacity: int

class CreateStudentRequest(BaseModel):
    name: str
    email: str
    password: str
    phone_number: str

class CreateTeacherRequest(BaseModel):
    name: str
    email: str
    password: str
    hourly_rate: Optional[float] = None
    bio: Optional[str] = None

class CreateGroupRequest(BaseModel):
    name: str
    category_id: Optional[int] = None
    hall_id: Optional[int] = None
    main_teacher_id: Optional[int] = None
    duration_minutes: int = 90
    capacity: int = 12
    class_name: Optional[str] = None
    is_trial: bool = False
    trial_price: Optional[int] = None
    trial_currency: Optional[str] = None
    start_date: str
    end_date: Optional[str] = None
    start_time: Optional[str] = None
    recurring_days: Optional[str] = None
    class Config:
        extra = "ignore"

class Unset:
    pass
UNSET = Unset()

class UpdateGroupRequest(BaseModel):
    name: Optional[str] = None
    category_id: Optional[int] = None
    hall_id: Optional[int] = UNSET
    main_teacher_id: Optional[int] = None
    duration_minutes: Optional[int] = None
    capacity: Optional[int] = None
    recurring_until: Optional[str] = None
    start_date: Optional[str] = None
    is_closed: Optional[bool] = None
    is_trial: Optional[bool] = None
    trial_price: Optional[int] = UNSET
    trial_currency: Optional[str] = UNSET
    schedules: Optional[dict] = None

    model_config = {
        "arbitrary_types_allowed": True
    }
    @field_validator('recurring_until')

    @classmethod
    def parse_recurring_until(cls, v):
        if v is None or v == "":
            return None
        if isinstance(v, str):
            try:
                return datetime.strptime(v, "%Y-%m-%d").date()
            except ValueError:
                try:
                    return datetime.strptime(v, "%m/%d/%Y").date()
                except ValueError:
                    try:
                        return datetime.strptime(v, "%d.%m.%Y").date()
                    except ValueError:
                        raise ValueError(f"Invalid date format for recurring_until: {v}. Expected YYYY-MM-DD")
        return v
    @field_validator('start_date')

    @classmethod
    def parse_start_date(cls, v):
        if v is None or v == "":
            return None
        if isinstance(v, str):
            try:
                return datetime.strptime(v, "%Y-%m-%d").date()
            except ValueError:
                try:
                    return datetime.strptime(v, "%m/%d/%Y").date()
                except ValueError:
                    try:
                        return datetime.strptime(v, "%d.%m.%Y").date()
                    except ValueError:
                        raise ValueError(f"Invalid date format for start_date: {v}. Expected YYYY-MM-DD")
        return v
    
class GroupLimitRequest(BaseModel):
    capacity: int

class AddStudentToGroupRequest(BaseModel):
    student_id: int
    is_trial: bool = False

class AttendanceRecord(BaseModel):
    student_id: int
    attended: bool

class SaveAttendanceRequest(BaseModel):
    lesson_date: datetime
    records: List[AttendanceRecord]

class AttendanceStatus(BaseModel):
    student_id: int
    status: str

class SaveLessonAttendanceRequest(BaseModel):
    attendance: List[AttendanceStatus]

class CreateLessonRequest(BaseModel):
    group_id: int
    class_name: str
    teacher_id: Optional[int] = None
    hall_id: Optional[int] = None
    start_time: Union[datetime, str]
    duration_minutes: int = 90
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

class UpdateLessonRequest(BaseModel):
    class_name: Optional[str] = None
    teacher_id: Optional[int] = None
    hall_id: Optional[int] = None
    start_time: Optional[Union[datetime, str]] = None
    duration_minutes: Optional[int] = None
    is_cancelled: Optional[bool] = None
    @field_validator('start_time')
    @classmethod
    def parse_start_time(cls, v):
        if v is None:
            return None
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

class SubstituteTeacherRequest(BaseModel):
    substitute_teacher_id: int

class RescheduleLessonRequest(BaseModel):
    lesson_date: Union[datetime, str]
    new_start_time: Union[datetime, str]
    new_hall_id: Optional[int] = None
    @field_validator('lesson_date', 'new_start_time')
    @classmethod
    def parse_datetime_fields(cls, v):
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

class UpdateHallRequest(BaseModel):
    name: Optional[str] = None
    capacity: Optional[int] = None

class UpdateTeacherRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    hourly_rate: Optional[float] = None
    bio: Optional[str] = None

class UpdateStudentRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    phone_number: Optional[str] = None

class AddScheduleRequest(BaseModel):
    day_of_week: int
    start_time: str
    end_time: str

class CreateLessonScheduleRequest(BaseModel):
    date: str
    start_time: str
    end_time: str
    repeat_enabled: bool = False
    repeat_frequency: Optional[str] = None
    repeat_until: Optional[str] = None
    comment: Optional[str] = None
    trial_used: Optional[bool] = None
    subscription_until: Optional[str] = None

@router.get("/analytics")
async def get_analytics(user: dict = Depends(require_admin)):
    pool = await get_connection()
    hall_rows = await pool.fetch(
        """
        SELECT
            h.id, h.name, h.capacity,
            COUNT(DISTINCT g.id) FILTER (WHERE g.is_additional = FALSE) AS regular_groups,
            COUNT(DISTINCT se.id) FILTER (WHERE se.additional = TRUE AND se.approved = TRUE) AS additional_lessons
        FROM halls h
        LEFT JOIN groups g ON g.hall_id = h.id
        LEFT JOIN schedule_exceptions se ON se.hall_id = h.id
        GROUP BY h.id, h.name, h.capacity
        ORDER BY h.id
        """
    )
    student_attendance_rows = await pool.fetch(
        """
        SELECT
            g.id, g.name,
            CASE WHEN COUNT(ar.id) = 0 THEN NULL
                 ELSE AVG(CASE WHEN ar.attended THEN 1 ELSE 0 END)
            END AS avg_attendance
        FROM groups g
        LEFT JOIN attendance_records ar ON ar.group_id = g.id
        GROUP BY g.id, g.name
        ORDER BY g.id
        """
    )
    teacher_attendance_rows = await pool.fetch(
        """
        SELECT
            t.id, u.name,
            CASE WHEN COUNT(ar.id) = 0 THEN NULL
                 ELSE AVG(CASE WHEN ar.teacher_present THEN 1 ELSE 0 END)
            END AS avg_presence
        FROM teachers t
        JOIN users u ON u.id = t.user_id
        LEFT JOIN attendance_records ar ON ar.teacher_id = t.id
        GROUP BY t.id, u.name
        ORDER BY t.id
        """
    )
    return {
        "halls": [
            {
                "id": r["id"],
                "name": r["name"],
                "capacity": r["capacity"],
                "regular_groups": int(r["regular_groups"]) if r["regular_groups"] else 0,
                "additional_lessons": int(r["additional_lessons"]) if r["additional_lessons"] else 0
            }
            for r in hall_rows
        ],
        "student_attendance": [
            {
                "group_id": r["id"],
                "group_name": r["name"],
                "average_attendance": float(r["avg_attendance"]) if r["avg_attendance"] else None
            }
            for r in student_attendance_rows
        ],
        "teacher_attendance": [
            {
                "teacher_id": r["id"],
                "teacher_name": r["name"],
                "average_presence": float(r["avg_presence"]) if r["avg_presence"] else None
            }
            for r in teacher_attendance_rows
        ]
    }
@router.get("/analytics/halls")
async def get_hall_analytics(user: dict = Depends(require_admin)):
    pool = await get_connection()
    rows = await pool.fetch(
        """
        WITH unique_weekly_slots AS (
            SELECT DISTINCT ON (l.hall_id, l.group_id, EXTRACT(DOW FROM l.start_time), l.start_time::time)
                l.hall_id,
                l.group_id,
                EXTRACT(DOW FROM l.start_time)::int AS day_of_week,
                l.start_time::time AS lesson_time,
                l.duration_minutes
            FROM lessons l
            JOIN groups g ON g.id = l.group_id AND g.is_closed = FALSE
            WHERE l.hall_id IS NOT NULL
              AND l.start_time >= CURRENT_DATE
              AND l.start_time < CURRENT_DATE + INTERVAL '30 days'
        )
        SELECT
            h.id, h.name,
            COALESCE(SUM(CASE WHEN uws.day_of_week = 1 THEN COALESCE(uws.duration_minutes, 60) / 60.0 ELSE 0 END), 0) AS monday_hours,
            COALESCE(SUM(CASE WHEN uws.day_of_week = 2 THEN COALESCE(uws.duration_minutes, 60) / 60.0 ELSE 0 END), 0) AS tuesday_hours,
            COALESCE(SUM(CASE WHEN uws.day_of_week = 3 THEN COALESCE(uws.duration_minutes, 60) / 60.0 ELSE 0 END), 0) AS wednesday_hours,
            COALESCE(SUM(CASE WHEN uws.day_of_week = 4 THEN COALESCE(uws.duration_minutes, 60) / 60.0 ELSE 0 END), 0) AS thursday_hours,
            COALESCE(SUM(CASE WHEN uws.day_of_week = 5 THEN COALESCE(uws.duration_minutes, 60) / 60.0 ELSE 0 END), 0) AS friday_hours,
            COALESCE(SUM(CASE WHEN uws.day_of_week = 6 THEN COALESCE(uws.duration_minutes, 60) / 60.0 ELSE 0 END), 0) AS saturday_hours,
            COALESCE(SUM(CASE WHEN uws.day_of_week = 0 THEN COALESCE(uws.duration_minutes, 60) / 60.0 ELSE 0 END), 0) AS sunday_hours
        FROM halls h
        LEFT JOIN unique_weekly_slots uws ON uws.hall_id = h.id
        GROUP BY h.id, h.name
        ORDER BY h.id
        """
    )
    halls = []
    for r in rows:
        monday = float(r["monday_hours"]) if r["monday_hours"] else 0
        tuesday = float(r["tuesday_hours"]) if r["tuesday_hours"] else 0
        wednesday = float(r["wednesday_hours"]) if r["wednesday_hours"] else 0
        thursday = float(r["thursday_hours"]) if r["thursday_hours"] else 0
        friday = float(r["friday_hours"]) if r["friday_hours"] else 0
        saturday = float(r["saturday_hours"]) if r["saturday_hours"] else 0
        sunday = float(r["sunday_hours"]) if r["sunday_hours"] else 0
        total = monday + tuesday + wednesday + thursday + friday + saturday + sunday
        halls.append({
            "hallId": r["id"],
            "hallName": r["name"],
            "monday": round(monday),
            "tuesday": round(tuesday),
            "wednesday": round(wednesday),
            "thursday": round(thursday),
            "friday": round(friday),
            "saturday": round(saturday),
            "sunday": round(sunday),
            "total": round(total)
        })
    return {"halls": halls}

@router.get("/analytics/teachers")
async def get_teacher_analytics(user: dict = Depends(require_admin)):
    pool = await get_connection()
    rows = await pool.fetch(
        """
        SELECT
            t.id, u.name,
            COALESCE(SUM(g.duration_minutes), 0) / 60.0 AS total_hours_per_week,
            COUNT(DISTINCT gst.student_id) AS student_count,
            COUNT(DISTINCT g.id) AS group_count
        FROM teachers t
        JOIN users u ON u.id = t.user_id
        LEFT JOIN group_teachers gt ON gt.teacher_id = t.id
        LEFT JOIN groups g ON g.id = gt.group_id AND g.is_closed = FALSE
        LEFT JOIN group_schedules gs ON gs.group_id = g.id AND gs.is_active = TRUE
        LEFT JOIN group_students gst ON gst.group_id = g.id AND gst.is_trial = FALSE
        GROUP BY t.id, u.name
        ORDER BY total_hours_per_week DESC
        """
    )
    teachers = [
        {
            "teacherId": r["id"],
            "teacherName": r["name"],
            "totalHours": round(float(r["total_hours_per_week"])) if r["total_hours_per_week"] else 0,
            "studentCount": int(r["student_count"]) if r["student_count"] else 0,
            "groupCount": int(r["group_count"]) if r["group_count"] else 0
        }
        for r in rows
    ]
    return {"teachers": teachers}
@router.get("/analytics/groups")
async def get_groups_analytics(user: dict = Depends(require_admin)):
    pool = await get_connection()
    rows = await pool.fetch(
        """
        SELECT
            g.id, g.name, g.capacity, g.is_closed,
            h.name as hall_name,
            u.name as teacher_name,
            COUNT(DISTINCT gs.student_id) as student_count,
            COALESCE(g.duration_minutes, 60) as duration_minutes,
            COALESCE(
                (SELECT COUNT(*)
                 FROM group_schedules gsch2
                 WHERE gsch2.group_id = g.id AND gsch2.is_active = TRUE), 0
            ) as schedule_count,
            COALESCE(
                (SELECT AVG(CASE WHEN ar.attended THEN 100.0 ELSE 0 END)
                 FROM attendance_records ar
                 WHERE ar.group_id = g.id), 0
            ) as avg_attendance
        FROM groups g
        LEFT JOIN halls h ON h.id = g.hall_id
        LEFT JOIN group_teachers gt ON gt.group_id = g.id AND gt.is_main = TRUE
        LEFT JOIN teachers t ON t.id = gt.teacher_id
        LEFT JOIN users u ON u.id = t.user_id
        LEFT JOIN group_students gs ON gs.group_id = g.id AND gs.is_trial = FALSE
        WHERE g.is_closed = FALSE
        GROUP BY g.id, g.name, g.capacity, g.is_closed, h.name, u.name
        ORDER BY g.name
        """
    )
    groups = [
        {
            "groupId": r["id"],
            "groupName": r["name"],
            "hallName": r["hall_name"] or "Не назначен",
            "teacherName": r["teacher_name"] or "Не назначен",
            "studentCount": int(r["student_count"]) if r["student_count"] else 0,
            "capacity": r["capacity"] or 0,
            "scheduleCount": 0,
            "hoursPerWeek": round((int(r["schedule_count"]) * int(r["duration_minutes"])) / 60, 1) if r["schedule_count"] else 0,
            "avgAttendance": round(float(r["avg_attendance"])) if r["avg_attendance"] else 0,
            "isClosed": r["is_closed"]
        }
        for r in rows
    ]
    return {"groups": groups}
@router.get("/analytics/students")
async def get_students_analytics(user: dict = Depends(require_admin)):
    pool = await get_connection()
    student_rows = await pool.fetch(
        """
        SELECT DISTINCT
            s.id, u.name, u.email, s.phone_number, s.subscription_until, s.trial_used,
            u.created_at as registered_at
        FROM students s
        JOIN users u ON u.id = s.user_id
        WHERE u.role = 'student'
        ORDER BY u.name
        """
    )
    students = []
    for student in student_rows:
        group_rows = await pool.fetch(
            """
            SELECT
                g.name as group_name,
                g.class_name,
                h.name as hall_name,
                teacher_user.name as teacher_name,
                COUNT(ar.id) as total_lessons_marked,
                COALESCE(SUM(
                    CASE ar.status
                        WHEN 'P' THEN 2
                        WHEN 'E' THEN 2
                        WHEN 'L' THEN 1
                        WHEN 'A' THEN 0
                        ELSE 0
                    END
                ), 0) as total_points
            FROM group_students gs
            JOIN groups g ON g.id = gs.group_id
            LEFT JOIN halls h ON h.id = g.hall_id
            LEFT JOIN group_teachers gt ON gt.group_id = g.id AND gt.is_main = TRUE
            LEFT JOIN teachers t ON t.id = gt.teacher_id
            LEFT JOIN users teacher_user ON teacher_user.id = t.user_id
            LEFT JOIN attendance_records ar ON ar.student_id = $1 AND ar.group_id = g.id
            WHERE gs.student_id = $1
            GROUP BY g.id, g.name, g.class_name, h.name, teacher_user.name
            """,
            student["id"]
        )
        groups = []
        for group in group_rows:
            total_points = float(group["total_points"]) if group["total_points"] else 0
            marked_lessons = int(group["total_lessons_marked"]) if group["total_lessons_marked"] else 0
            max_points_marked = marked_lessons * 2
            attendance_percentage = round((total_points / max_points_marked * 100), 1) if max_points_marked > 0 else 0
            schedule_rows = await pool.fetch(
                """
                SELECT day_of_week, start_time
                FROM group_schedules gs2
                JOIN group_students gst ON gst.group_id = gs2.group_id
                JOIN groups g ON g.id = gs2.group_id
                WHERE gst.student_id = $1 AND g.name = $2 AND gs2.is_active = TRUE
                ORDER BY gs2.day_of_week
                LIMIT 1
                """,
                student["id"], group["group_name"]
            )
            schedule = ""
            if schedule_rows:
                day_names = {0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat"}
                row = schedule_rows[0]
                day_name = day_names.get(row["day_of_week"], "")
                time_str = row["start_time"].strftime("%H:%M") if row["start_time"] else ""
                schedule = f"{day_name} {time_str}"
            groups.append({
                "groupName": group["group_name"],
                "teacher": group["teacher_name"] or "Не назначен",
                "schedule": schedule,
                "attendance": attendance_percentage,
                "hall": group["hall_name"] or "Не указан"
            })
        students.append({
            "id": student["id"],
            "name": student["name"],
            "email": student["email"],
            "phone": student["phone_number"] or "",
            "parentPhone": "",
            "groups": groups,
            "lessonsRemaining": 10,
            "subscriptionUntil": str(student["subscription_until"]) if student["subscription_until"] else None,
            "isActive": len(groups) > 0,
            "registeredAt": str(student["registered_at"]) if student["registered_at"] else None
        })
    stats_row = await pool.fetchrow(
        """
        SELECT
            COUNT(DISTINCT s.id) as total_students,
            COUNT(DISTINCT CASE WHEN gs.student_id IS NOT NULL THEN s.id END) as active_students,
            COUNT(DISTINCT CASE WHEN u.created_at >= CURRENT_DATE - INTERVAL '30 days' THEN s.id END) as new_this_month,
            COALESCE(
                (SELECT ROUND(
                    AVG(
                        (CASE ar.status
                            WHEN 'P' THEN 2
                            WHEN 'E' THEN 2
                            WHEN 'L' THEN 1
                            WHEN 'A' THEN 0
                            ELSE 0
                        END) / 2.0 * 100.0
                    ), 1
                )
                 FROM attendance_records ar
                 JOIN students s2 ON s2.id = ar.student_id
                 JOIN users u2 ON u2.id = s2.user_id
                 WHERE u2.role = 'student'),
                0
            ) as avg_attendance
        FROM students s
        JOIN users u ON u.id = s.user_id
        LEFT JOIN group_students gs ON gs.student_id = s.id
        WHERE u.role = 'student'
        """
    )
    return {
        "students": students,
        "stats": {
            "totalStudents": int(stats_row["total_students"]) if stats_row["total_students"] else 0,
            "activeStudents": int(stats_row["active_students"]) if stats_row["active_students"] else 0,
            "newThisMonth": int(stats_row["new_this_month"]) if stats_row["new_this_month"] else 0,
            "avgAttendance": round(float(stats_row["avg_attendance"])) if stats_row["avg_attendance"] else 0
        }
    }

@router.get("/schedule/weekly")
async def get_weekly_schedule(
    week_start: str,
    user: dict = Depends(require_admin)
):
    from datetime import datetime, timedelta
    pool = await get_connection()
    try:
        week_start_date = datetime.strptime(week_start, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    week_end_date = week_start_date + timedelta(days=6)
    existing_lessons = await pool.fetch(
        """
        SELECT
            l.id as lesson_id,
            l.group_id, l.class_name, l.duration_minutes, l.start_time,
            l.is_cancelled, l.is_rescheduled, l.substitute_teacher_id,
            g.name as group_name,
            h.id as hall_id, h.name as hall_name,
            t.id as teacher_id, u.name as teacher_name,
            sub_t.id as sub_teacher_id, sub_u.name as sub_teacher_name
        FROM lessons l
        JOIN groups g ON g.id = l.group_id
        LEFT JOIN halls h ON h.id = l.hall_id
        LEFT JOIN teachers t ON t.id = l.teacher_id
        LEFT JOIN users u ON u.id = t.user_id
        LEFT JOIN teachers sub_t ON sub_t.id = l.substitute_teacher_id
        LEFT JOIN users sub_u ON sub_u.id = sub_t.user_id
        WHERE DATE(l.start_time) BETWEEN $1 AND $2
          AND (g.recurring_until IS NULL OR DATE(l.start_time) <= g.recurring_until)
          AND (g.start_date IS NULL OR DATE(l.start_time) >= g.start_date)
        ORDER BY l.start_time
        """,
        week_start_date, week_end_date
    )
    groups_with_schedules = await pool.fetch(
        """
        SELECT
            g.id as group_id, g.name as group_name, g.class_name, g.duration_minutes, g.recurring_until, g.start_date,
            h.id as hall_id, h.name as hall_name,
            t.id as teacher_id, u.name as teacher_name,
            gs.day_of_week, gs.start_time
        FROM groups g
        JOIN group_schedules gs ON gs.group_id = g.id AND gs.is_active = TRUE
        LEFT JOIN halls h ON h.id = g.hall_id
        LEFT JOIN group_teachers gt ON gt.group_id = g.id AND gt.is_main = TRUE
        LEFT JOIN teachers t ON t.id = gt.teacher_id
        LEFT JOIN users u ON u.id = t.user_id
        WHERE g.is_closed = FALSE
        ORDER BY g.id, gs.day_of_week, gs.start_time
        """
    )
    schedule_entries = []
    for lesson in existing_lessons:
        start_datetime = lesson["start_time"]
        if hasattr(start_datetime, 'tzinfo') and start_datetime.tzinfo is not None:
            from datetime import timezone, timedelta
            local_tz = timezone(timedelta(hours=5))
            start_datetime = start_datetime.astimezone(local_tz).replace(tzinfo=None)
        date = start_datetime.date()
        day_index = date.weekday()
        duration = lesson["duration_minutes"] or 60
        end_datetime = start_datetime + timedelta(minutes=duration)
        teacher_id = lesson["sub_teacher_id"] if lesson["substitute_teacher_id"] else lesson["teacher_id"]
        teacher_name = lesson["sub_teacher_name"] if lesson["substitute_teacher_id"] else lesson["teacher_name"]
        if lesson["substitute_teacher_id"] and lesson["sub_teacher_name"]:
            display_teacher_name = f"Замена: {lesson['sub_teacher_name']}"
        else:
            display_teacher_name = teacher_name or "Не назначен"
        schedule_entries.append({
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
            "teacherId": teacher_id,
            "teacherName": display_teacher_name,
            "isCancelled": lesson["is_cancelled"],
            "isRescheduled": lesson["is_rescheduled"],
            "hasSubstitute": lesson["substitute_teacher_id"] is not None,
            "substituteTeacherName": lesson["sub_teacher_name"] if lesson["substitute_teacher_id"] else None,
            "status": "Отменён" if lesson["is_cancelled"] else ("Перенесён" if lesson["is_rescheduled"] else None)
        })
    schedule_entries.sort(key=lambda x: (x["dayIndex"], x["startTime"]))
    time_slots = []
    for hour in range(8, 22):
        time_slots.append({
            "start": f"{hour:02d}:00",
            "end": f"{hour+1:02d}:00",
            "label": f"{hour:02d}:00"
        })
    return {
        "weekStart": week_start,
        "weekEnd": week_end_date.isoformat(),
        "entries": schedule_entries,
        "timeSlots": time_slots
    }

@router.get("/groups")
async def get_groups(user: dict = Depends(require_admin)):
    pool = await get_connection()
    rows = await pool.fetch(
        """
        SELECT
            g.id, g.name, g.capacity, g.duration_minutes,
            g.is_additional, g.is_closed, g.is_trial, g.trial_price, g.trial_currency, g.notes,
            h.id AS hall_id, h.name AS hall_name,
            u.name AS teacher_name,
            c.id AS category_id, c.name AS category_name, c.color AS category_color,
            (SELECT COUNT(*) FROM group_students WHERE group_id = g.id) AS enrolled
        FROM groups g
        LEFT JOIN halls h ON h.id = g.hall_id
        LEFT JOIN categories c ON c.id = g.category_id
        LEFT JOIN group_teachers gt ON gt.group_id = g.id AND gt.is_main = TRUE
        LEFT JOIN teachers t ON t.id = gt.teacher_id
        LEFT JOIN users u ON u.id = t.user_id
        ORDER BY g.id
        """
    )
    groups = []
    for r in rows:
        enrolled = int(r["enrolled"]) if r["enrolled"] else 0
        schedule = await get_group_schedule_formatted(pool, r["id"])
        groups.append({
            "id": r["id"],
            "name": r["name"],
            "teacherName": r["teacher_name"] or "Не назначен",
            "schedule": schedule,
            "hallName": r["hall_name"] or "Не назначен",
            "hallId": r["hall_id"],
            "studentLimit": r["capacity"],
            "studentCount": enrolled,
            "isActive": not r["is_closed"],
            "is_trial": r["is_trial"],
            "trial_price": r["trial_price"],
                        "trial_currency": r["trial_currency"],
            "category": {
                "id": r["category_id"],
                "name": r["category_name"],
                "color": r["category_color"]
            } if r["category_id"] else None,
            "capacity": r["capacity"],
            "duration_minutes": r["duration_minutes"],
            "is_additional": r["is_additional"],
            "is_closed": r["is_closed"],
            "notes": r["notes"],
            "hall": {"id": r["hall_id"], "name": r["hall_name"]} if r["hall_id"] else None,
            "teacher_name": r["teacher_name"],
            "enrolled": enrolled,
            "free_slots": r["capacity"] - enrolled if r["capacity"] else None
        })
    return {"groups": groups}

@router.get("/groups/{group_id}")
async def get_group_details(group_id: int, user: dict = Depends(require_admin)):
    pool = await get_connection()
    row = await pool.fetchrow(
        """
        SELECT
            g.id, g.name, g.capacity, g.duration_minutes, g.category_id,
            g.is_additional, g.is_closed, g.is_trial, g.trial_price, g.trial_currency, g.recurring_until, g.notes, g.class_name,
            g.start_date,
            h.id AS hall_id, h.name AS hall_name,
            t.id AS teacher_id, u.name AS teacher_name,
            c.name AS category_name
        FROM groups g
        LEFT JOIN halls h ON h.id = g.hall_id
        LEFT JOIN group_teachers gt ON gt.group_id = g.id AND gt.is_main = TRUE
        LEFT JOIN teachers t ON t.id = gt.teacher_id
        LEFT JOIN users u ON u.id = t.user_id
        LEFT JOIN categories c ON c.id = g.category_id
        WHERE g.id = $1
        """,
        group_id
    )
    if not row:
        raise HTTPException(status_code=404, detail="Group not found")
    total_lessons_in_group = await pool.fetchval(
        """
        SELECT COUNT(*) FROM lessons WHERE group_id = $1
        """,
        group_id
    ) or 0
    students_rows = await pool.fetch(
        """
        SELECT
            s.id, u.name, u.email, s.phone_number,
            COUNT(ar.id) as total_lessons_marked,
            -- Calculate total points: P=2, E=2, L=1, A=0
            COALESCE(SUM(
                CASE ar.status
                    WHEN 'P' THEN 2
                    WHEN 'E' THEN 2
                    WHEN 'L' THEN 1
                    WHEN 'A' THEN 0
                    ELSE 0
                END
            ), 0) as total_points
        FROM group_students gs
        JOIN students s ON s.id = gs.student_id
        JOIN users u ON u.id = s.user_id
        LEFT JOIN attendance_records ar ON ar.student_id = s.id AND ar.group_id = $1
        WHERE gs.group_id = $1
        GROUP BY s.id, u.name, u.email, s.phone_number
        ORDER BY u.name
        """,
        group_id
    )
    students = []
    for s in students_rows:
        total_points = float(s["total_points"]) if s["total_points"] else 0
        marked_lessons = int(s["total_lessons_marked"]) if s["total_lessons_marked"] else 0
        max_points_marked = marked_lessons * 2
        attendance_percentage = round((total_points / max_points_marked * 100), 1) if max_points_marked > 0 else 0
        max_points_total = total_lessons_in_group * 2
        students.append({
            "id": s["id"],
            "name": s["name"],
            "email": s["email"],
            "phone": s["phone_number"] or "",
            "attendanceCount": marked_lessons,
            "attendance_percentage": attendance_percentage,
            "total_points": total_points,
            "max_points": max_points_total
        })
    teachers_rows = await pool.fetch(
        """
        SELECT t.id, u.name, gt.is_main
        FROM group_teachers gt
        JOIN teachers t ON t.id = gt.teacher_id
        JOIN users u ON u.id = t.user_id
        WHERE gt.group_id = $1
        ORDER BY gt.is_main DESC, u.name
        """,
        group_id
    )
    teachers = [
        {
            "id": t["id"],
            "name": t["name"],
            "is_main": t["is_main"]
        }
        for t in teachers_rows
    ]
    schedule = await get_group_schedule_formatted(pool, group_id)
    schedule_rows = await pool.fetch(
        """
        SELECT day_of_week, start_time
        FROM group_schedules
        WHERE group_id = $1 AND is_active = TRUE
        ORDER BY day_of_week
        """,
        group_id
    )
    schedules_dict = {}
    day_num_to_name = {0: "sunday", 1: "monday", 2: "tuesday", 3: "wednesday", 4: "thursday", 5: "friday", 6: "saturday"}
    for sr in schedule_rows:
        day_name = day_num_to_name.get(sr["day_of_week"], "")
        if day_name and sr["start_time"]:
            schedules_dict[day_name] = sr["start_time"].strftime("%H:%M")
    return {
        "id": row["id"],
        "name": row["name"],
        "teacherId": row["teacher_id"],
        "teacherName": row["teacher_name"] or "Не назначен",
        "teachers": teachers,
        "schedule": schedule,
        "hallName": row["hall_name"] or "Не назначен",
        "hallId": row["hall_id"],
        "studentLimit": row["capacity"],
        "isActive": not row["is_closed"],
        "is_trial": row["is_trial"],
        "trial_price": row["trial_price"],
        "trial_currency": row["trial_currency"],
        "schedules": schedules_dict,
        "start_date": row["start_date"].strftime("%Y-%m-%d") if row["start_date"] else "",
        "recurring_until": row["recurring_until"].strftime("%Y-%m-%d") if row["recurring_until"] else "",
        "students": students,
        "category_id": row["category_id"],
        "category_name": row["category_name"],
        "duration_minutes": row["duration_minutes"]
    }
@router.post("/groups")
async def create_group(data: CreateGroupRequest, user: dict = Depends(require_admin)):
    from datetime import datetime
    pool = await get_connection()
    try:
        print(f"Received group data: {data}")
        start_date = datetime.strptime(data.start_date, "%Y-%m-%d").date()
        end_date = datetime.strptime(data.end_date, "%Y-%m-%d").date() if data.end_date else None
        async with pool.acquire() as conn:
            async with conn.transaction():
                result = await conn.fetchrow(
                    """
                    INSERT INTO groups (name, category_id, hall_id, duration_minutes, capacity, class_name, is_trial, trial_price, trial_currency, start_date, recurring_until)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    RETURNING id
                    """,
                    data.name,
                    data.category_id,
                    data.hall_id,
                    data.duration_minutes,
                    data.capacity,
                    data.class_name,
                    data.is_trial,
                    (data.trial_price if data.is_trial else None),
                    (data.trial_currency if data.is_trial else None),
                    start_date,
                    end_date,
                )
                group_id = result["id"]
                if data.main_teacher_id:
                    await conn.execute(
                        """
                        INSERT INTO group_teachers (group_id, teacher_id, is_main)
                        VALUES ($1, $2, TRUE)
                        ON CONFLICT (group_id, teacher_id) DO UPDATE SET is_main = TRUE
                        """,
                        group_id, data.main_teacher_id
                    )
        return {"group_id": group_id, "message": "Group created successfully"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid date format: {str(e)}")
    except Exception as e:
        print(f"Error creating group: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create group: {str(e)}")
@router.put("/groups/{group_id}")
async def update_group(group_id: int, data: UpdateGroupRequest, user: dict = Depends(require_admin)):
    pool = await get_connection()
    updates = []
    values = []
    param_count = 1
    if data.name is not None:
        updates.append(f"name = ${param_count}")
        values.append(data.name)
        param_count += 1
    if data.category_id is not None:
        updates.append(f"category_id = ${param_count}")
        values.append(data.category_id if data.category_id != 0 else None)
        param_count += 1
    if not isinstance(data.hall_id, Unset):
        updates.append(f"hall_id = ${param_count}")
        values.append(data.hall_id if data.hall_id and data.hall_id != 0 else None)
        param_count += 1
    if data.duration_minutes is not None:
        updates.append(f"duration_minutes = ${param_count}")
        values.append(data.duration_minutes)
        param_count += 1
    if data.capacity is not None:
        updates.append(f"capacity = ${param_count}")
        values.append(data.capacity)
        param_count += 1
    if data.recurring_until is not None:
        updates.append(f"recurring_until = ${param_count}")
        values.append(data.recurring_until if data.recurring_until != "" else None)
        param_count += 1
    if data.start_date is not None:
        updates.append(f"start_date = ${param_count}")
        values.append(data.start_date if data.start_date != "" else None)
        param_count += 1
    if data.is_closed is not None:
        updates.append(f"is_closed = ${param_count}")
        values.append(data.is_closed)
        param_count += 1
    if data.is_trial is not None:
        updates.append(f"is_trial = ${param_count}")
        values.append(data.is_trial)
        param_count += 1

        if data.is_trial is False and isinstance(data.trial_price, Unset):
            updates.append("trial_price = NULL")

        if data.is_trial is False and isinstance(data.trial_currency, Unset):
            updates.append("trial_currency = NULL")

    if not isinstance(data.trial_price, Unset):
        updates.append(f"trial_price = ${param_count}")
        values.append(data.trial_price)
        param_count += 1

    if not isinstance(data.trial_currency, Unset):
        updates.append(f"trial_currency = ${param_count}")
        values.append(data.trial_currency)
        param_count += 1
    if updates:
        values.append(group_id)
        await pool.execute(
            f"UPDATE groups SET {', '.join(updates)} WHERE id = ${param_count}",
            *values
        )
    if not isinstance(data.hall_id, Unset):
        hall_id_value = data.hall_id if data.hall_id and data.hall_id != 0 else None
        await pool.execute(
            """
            UPDATE lessons
            SET hall_id = $2
            WHERE group_id = $1
            """,
            group_id, hall_id_value
        )
    if data.main_teacher_id is not None:
        await pool.execute(
            "UPDATE group_teachers SET is_main = FALSE WHERE group_id = $1",
            group_id
        )
        if data.main_teacher_id != 0:
            await pool.execute(
                """
                INSERT INTO group_teachers (group_id, teacher_id, is_main)
                VALUES ($1, $2, TRUE)
                ON CONFLICT (group_id, teacher_id) DO UPDATE SET is_main = TRUE
                """,
                group_id, data.main_teacher_id
            )
            await pool.execute(
                """
                UPDATE lessons
                SET teacher_id = $2
                WHERE group_id = $1
                """,
                group_id, data.main_teacher_id
            )
    if data.schedules is not None:
        await save_group_schedule(pool, group_id, data.schedules)
    return {"message": "Group updated"}
@router.delete("/groups/{group_id}")
async def delete_group(group_id: int, force: bool = False, user: dict = Depends(require_admin)):
    pool = await get_connection()
    async with pool.acquire() as conn:
        async with conn.transaction():
            if not force:
                student_count = await conn.fetchval(
                    "SELECT COUNT(*) FROM group_students WHERE group_id = $1", group_id
                )
                if student_count > 0:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Cannot delete group - it has {student_count} students enrolled. Use force=true to delete anyway or remove all students first."
                    )
            await conn.execute("DELETE FROM group_students WHERE group_id = $1", group_id)
            await conn.execute("DELETE FROM group_teachers WHERE group_id = $1", group_id)
            await conn.execute("DELETE FROM group_schedules WHERE group_id = $1", group_id)
            await conn.execute("DELETE FROM attendance_records WHERE student_id IN (SELECT student_id FROM group_students WHERE group_id = $1)", group_id)
            await conn.execute("DELETE FROM lessons WHERE group_id = $1", group_id)
            await sync_group_schedules_with_lessons(conn, group_id)
            result = await conn.execute("DELETE FROM groups WHERE id = $1", group_id)
            if result == "DELETE 0":
                raise HTTPException(status_code=404, detail="Group not found")
    return {"message": "Group deleted"}
@router.post("/groups/{group_id}/close")
async def close_group(group_id: int, user: dict = Depends(require_admin)):
    pool = await get_connection()
    result = await pool.execute(
        "UPDATE groups SET is_closed = TRUE WHERE id = $1",
        group_id
    )
    if result == "UPDATE 0":
        raise HTTPException(status_code=404, detail="Group not found")
    return {"message": "Group closed"}
@router.post("/groups/{group_id}/open")
async def open_group(group_id: int, user: dict = Depends(require_admin)):
    pool = await get_connection()
    result = await pool.execute(
        "UPDATE groups SET is_closed = FALSE WHERE id = $1",
        group_id
    )
    if result == "UPDATE 0":
        raise HTTPException(status_code=404, detail="Group not found")
    return {"message": "Group opened"}
@router.get("/halls")
async def get_halls(user: dict = Depends(require_admin)):
    pool = await get_connection()
    rows = await pool.fetch("SELECT id, name, capacity FROM halls ORDER BY id")
    return {
        "halls": [
            {"id": r["id"], "name": r["name"], "capacity": r["capacity"]}
            for r in rows
        ]
    }
@router.get("/halls/{hall_id}/details")
async def get_hall_details(hall_id: int, user: dict = Depends(require_admin)):
    pool = await get_connection()
    hall = await pool.fetchrow("SELECT id, name, capacity FROM halls WHERE id = $1", hall_id)
    if not hall:
        raise HTTPException(status_code=404, detail="Hall not found")
    groups_rows = await pool.fetch(
        """
        SELECT
            g.id, g.name, g.class_name, g.capacity, g.duration_minutes,
            t.id as teacher_id, u.name as teacher_name,
            (SELECT COUNT(*) FROM group_students gs WHERE gs.group_id = g.id) as student_count
        FROM groups g
        LEFT JOIN group_teachers gt ON gt.group_id = g.id AND gt.is_main = TRUE
        LEFT JOIN teachers t ON t.id = gt.teacher_id
        LEFT JOIN users u ON u.id = t.user_id
        WHERE g.hall_id = $1 AND g.is_closed = FALSE
        ORDER BY g.name
        """,
        hall_id
    )
    groups = []
    for g in groups_rows:
        schedule_str = await get_group_schedule_formatted(pool, g["id"])
        groups.append({
            "id": g["id"],
            "name": g["name"],
            "className": g["class_name"] or "",
            "capacity": g["capacity"],
            "studentCount": g["student_count"] or 0,
            "durationMinutes": g["duration_minutes"] or 90,
            "teacherId": g["teacher_id"],
            "teacherName": g["teacher_name"] or "Не назначен",
            "schedule": schedule_str
        })
    today_lessons = await pool.fetch(
        """
        SELECT
            l.id, l.start_time, l.duration_minutes, l.class_name,
            g.name as group_name,
            u.name as teacher_name
        FROM lessons l
        JOIN groups g ON g.id = l.group_id
        LEFT JOIN teachers t ON t.id = l.teacher_id
        LEFT JOIN users u ON u.id = t.user_id
        WHERE l.hall_id = $1
            AND DATE(l.start_time) = CURRENT_DATE
            AND l.is_cancelled = FALSE
        ORDER BY l.start_time
        """,
        hall_id
    )
    today = [
        {
            "id": l["id"],
            "startTime": l["start_time"].isoformat() if l["start_time"] else None,
            "duration": l["duration_minutes"] or 90,
            "className": l["class_name"],
            "groupName": l["group_name"],
            "teacherName": l["teacher_name"] or "Не назначен"
        }
        for l in today_lessons
    ]
    total_slots_per_week = 7 * 12
    used_slots = len(groups)
    return {
        "id": hall["id"],
        "name": hall["name"],
        "capacity": hall["capacity"],
        "groups": groups,
        "todayLessons": today,
        "stats": {
            "totalGroups": len(groups),
            "totalStudents": sum(g["studentCount"] for g in groups),
            "uniqueTeachers": len(set(g["teacherId"] for g in groups if g["teacherId"]))
        }
    }
@router.post("/halls")
async def create_hall(data: CreateHallRequest, user: dict = Depends(require_admin)):
    pool = await get_connection()
    result = await pool.fetchrow(
        "INSERT INTO halls (name, capacity) VALUES ($1, $2) RETURNING id",
        data.name, data.capacity
    )
    return {"hall_id": result["id"]}
@router.put("/halls/{hall_id}")
async def update_hall(hall_id: int, data: UpdateHallRequest, user: dict = Depends(require_admin)):
    pool = await get_connection()
    updates = []
    values = []
    param_count = 1
    if data.name is not None:
        updates.append(f"name = ${param_count}")
        values.append(data.name)
        param_count += 1
    if data.capacity is not None:
        updates.append(f"capacity = ${param_count}")
        values.append(data.capacity)
        param_count += 1
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    values.append(hall_id)
    await pool.execute(
        f"UPDATE halls SET {', '.join(updates)} WHERE id = ${param_count}",
        *values
    )
    return {"message": "Hall updated"}
@router.delete("/halls/{hall_id}")
async def delete_hall(hall_id: int, user: dict = Depends(require_admin)):
    pool = await get_connection()
    usage_check = await pool.fetchval(
        "SELECT COUNT(*) FROM groups WHERE hall_id = $1", hall_id
    )
    if usage_check > 0:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete hall - it is currently assigned to one or more groups"
        )
    result = await pool.execute("DELETE FROM halls WHERE id = $1", hall_id)
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Hall not found")
    return {"message": "Hall deleted"}
@router.get("/teachers")
async def get_teachers(user: dict = Depends(require_admin)):
    pool = await get_connection()
    rows = await pool.fetch(
        """
        SELECT
            u.id AS user_id,
            u.name,
            u.email,
            t.id AS teacher_id,
            t.hourly_rate,
            t.bio
        FROM users u
        LEFT JOIN teachers t ON t.user_id = u.id
        WHERE u.role = 'teacher'
        ORDER BY u.name
        """
    )
    return {
        "teachers": [
            {
                "id": r["teacher_id"] or r["user_id"],
                "user_id": r["user_id"],
                "name": r["name"],
                "email": r["email"],
                "hourly_rate": float(r["hourly_rate"]) if r["hourly_rate"] else None,
                "bio": r["bio"]
            }
            for r in rows
        ]
    }

@router.get("/teachers/{teacher_id}/groups")
async def get_teacher_groups(teacher_id: int, user: dict = Depends(require_admin)):
    pool = await get_connection()
    rows = await pool.fetch(
        """
        SELECT
            g.id,
            g.name,
            g.duration_minutes,
            h.name AS hall_name,
            gt.is_main
        FROM groups g
        INNER JOIN group_teachers gt ON gt.group_id = g.id AND gt.teacher_id = $1
        LEFT JOIN halls h ON h.id = g.hall_id
        WHERE g.is_closed = FALSE
        ORDER BY g.name
        """,
        teacher_id
    )
    schedules = []
    for r in rows:
        schedule_str = await get_group_schedule_formatted(pool, r["id"])
        schedules.append({
            "groupId": r["id"],
            "groupName": r["name"],
            "schedule": schedule_str,
            "hallName": r["hall_name"] or "Не указан",
            "duration": r["duration_minutes"] or 90,
            "isMain": r["is_main"]
        })
    return {"schedules": schedules}

@router.post("/teachers")
async def create_teacher(data: CreateTeacherRequest, user: dict = Depends(require_admin)):
    from app.auth import get_password_hash
    pool = await get_connection()
    hashed_password = get_password_hash(data.password)
    async with pool.acquire() as conn:
        async with conn.transaction():
            user_row = await conn.fetchrow(
                """
                INSERT INTO users (name, email, password, role)
                VALUES ($1, $2, $3, 'teacher')
                RETURNING id
                """,
                data.name, data.email, hashed_password
            )
            teacher_row = await conn.fetchrow(
                """
                INSERT INTO teachers (user_id, hourly_rate, bio)
                VALUES ($1, $2, $3)
                RETURNING id
                """,
                user_row["id"], data.hourly_rate, data.bio
            )
    return {"teacher_id": teacher_row["id"]}

@router.put("/teachers/{teacher_id}")
async def update_teacher(teacher_id: int, data: UpdateTeacherRequest, user: dict = Depends(require_admin)):
    from app.auth import get_password_hash
    pool = await get_connection()
    async with pool.acquire() as conn:
        async with conn.transaction():
            teacher_row = await conn.fetchrow(
                "SELECT user_id FROM teachers WHERE id = $1", teacher_id
            )
            if not teacher_row:
                raise HTTPException(status_code=404, detail="Teacher not found")
            user_id = teacher_row["user_id"]
            user_updates = []
            user_values = []
            param_count = 1
            if data.name is not None:
                user_updates.append(f"name = ${param_count}")
                user_values.append(data.name)
                param_count += 1
            if data.email is not None:
                user_updates.append(f"email = ${param_count}")
                user_values.append(data.email)
                param_count += 1
            if data.password is not None:
                user_updates.append(f"password = ${param_count}")
                user_values.append(get_password_hash(data.password))
                param_count += 1
            if user_updates:
                user_values.append(user_id)
                await conn.execute(
                    f"UPDATE users SET {', '.join(user_updates)} WHERE id = ${param_count}",
                    *user_values
                )
            teacher_updates = []
            teacher_values = []
            param_count = 1
            if data.hourly_rate is not None:
                teacher_updates.append(f"hourly_rate = ${param_count}")
                teacher_values.append(data.hourly_rate)
                param_count += 1
            if data.bio is not None:
                teacher_updates.append(f"bio = ${param_count}")
                teacher_values.append(data.bio)
                param_count += 1
            if teacher_updates:
                teacher_values.append(teacher_id)
                await conn.execute(
                    f"UPDATE teachers SET {', '.join(teacher_updates)} WHERE id = ${param_count}",
                    *teacher_values
                )
    return {"message": "Teacher updated"}

@router.delete("/teachers/{teacher_id}")
async def delete_teacher(teacher_id: int, user: dict = Depends(require_admin)):
    pool = await get_connection()
    async with pool.acquire() as conn:
        async with conn.transaction():
            usage_check = await conn.fetchval(
                "SELECT COUNT(*) FROM group_teachers WHERE teacher_id = $1", teacher_id
            )
            if usage_check > 0:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot delete teacher - they are currently assigned to one or more groups"
                )
            teacher_row = await conn.fetchrow(
                "SELECT user_id FROM teachers WHERE id = $1", teacher_id
            )
            if not teacher_row:
                raise HTTPException(status_code=404, detail="Teacher not found")
            user_id = teacher_row["user_id"]
            await conn.execute("DELETE FROM teachers WHERE id = $1", teacher_id)
            await conn.execute("DELETE FROM users WHERE id = $1", user_id)
    return {"message": "Teacher deleted"}

@router.get("/students")
async def get_students(user: dict = Depends(require_admin)):
    pool = await get_connection()
    rows = await pool.fetch(
        """
        SELECT s.id, u.id AS user_id, u.name, u.email, s.phone_number,
               s.trial_used, s.subscription_until
        FROM students s
        JOIN users u ON u.id = s.user_id
        WHERE u.role = 'student'
        ORDER BY u.name
        """
    )
    return {
        "students": [
            {
                "id": r["id"],
                "user_id": r["user_id"],
                "name": r["name"],
                "email": r["email"],
                "phone_number": r["phone_number"],
                "trial_used": r["trial_used"],
                "subscription_until": str(r["subscription_until"]) if r["subscription_until"] else None
            }
            for r in rows
        ]
    }
@router.post("/students")
async def create_student(data: CreateStudentRequest, user: dict = Depends(require_admin)):
    from app.auth import get_password_hash
    pool = await get_connection()
    hashed_password = get_password_hash(data.password)
    async with pool.acquire() as conn:
        async with conn.transaction():
            user_row = await conn.fetchrow(
                """
                INSERT INTO users (name, email, password, role)
                VALUES ($1, $2, $3, 'student')
                RETURNING id
                """,
                data.name, data.email, hashed_password
            )
            student_row = await conn.fetchrow(
                """
                INSERT INTO students (user_id, phone_number)
                VALUES ($1, $2)
                RETURNING id
                """,
                user_row["id"], data.phone_number
            )
    return {"student_id": student_row["id"]}
@router.put("/students/{student_id}")
async def update_student(student_id: int, data: UpdateStudentRequest, user: dict = Depends(require_admin)):
    from app.auth import get_password_hash
    from datetime import datetime
    pool = await get_connection()
    async with pool.acquire() as conn:
        async with conn.transaction():
            student_row = await conn.fetchrow(
                "SELECT user_id FROM students WHERE id = $1", student_id
            )
            if not student_row:
                raise HTTPException(status_code=404, detail="Student not found")
            user_id = student_row["user_id"]
            user_updates = []
            user_values = []
            param_count = 1
            if data.name is not None:
                user_updates.append(f"name = ${param_count}")
                user_values.append(data.name)
                param_count += 1
            if data.email is not None:
                user_updates.append(f"email = ${param_count}")
                user_values.append(data.email)
                param_count += 1
            if data.password is not None:
                user_updates.append(f"password = ${param_count}")
                user_values.append(get_password_hash(data.password))
                param_count += 1
            if user_updates:
                user_values.append(user_id)
                await conn.execute(
                    f"UPDATE users SET {', '.join(user_updates)} WHERE id = ${param_count}",
                    *user_values
                )
            student_updates = []
            student_values = []
            param_count = 1
            if data.phone_number is not None:
                student_updates.append(f"phone_number = ${param_count}")
                student_values.append(data.phone_number)
                param_count += 1
            if data.comment is not None:
                student_updates.append(f"comment = ${param_count}")
                student_values.append(data.comment)
                param_count += 1
            if data.trial_used is not None:
                student_updates.append(f"trial_used = ${param_count}")
                student_values.append(data.trial_used)
                param_count += 1
            if data.subscription_until is not None:
                try:
                    sub_date = datetime.strptime(data.subscription_until, "%Y-%m-%d").date()
                    student_updates.append(f"subscription_until = ${param_count}")
                    student_values.append(sub_date)
                    param_count += 1
                except ValueError:
                    raise HTTPException(status_code=400, detail="Invalid subscription_until format. Use YYYY-MM-DD")
            if student_updates:
                student_values.append(student_id)
                await conn.execute(
                    f"UPDATE students SET {', '.join(student_updates)} WHERE id = ${param_count}",
                    *student_values
                )
    return {"message": "Student updated"}
@router.delete("/students/{student_id}")
async def delete_student(student_id: int, user: dict = Depends(require_admin)):
    pool = await get_connection()
    async with pool.acquire() as conn:
        async with conn.transaction():
            usage_check = await conn.fetchval(
                "SELECT COUNT(*) FROM group_students WHERE student_id = $1", student_id
            )
            if usage_check > 0:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot delete student - they are currently enrolled in one or more groups"
                )
            student_row = await conn.fetchrow(
                "SELECT user_id FROM students WHERE id = $1", student_id
            )
            if not student_row:
                raise HTTPException(status_code=404, detail="Student not found")
            user_id = student_row["user_id"]
            await conn.execute("DELETE FROM students WHERE id = $1", student_id)
            await conn.execute("DELETE FROM users WHERE id = $1", user_id)
    return {"message": "Student deleted"}
@router.get("/groups/{group_id}/students")
async def get_group_students(group_id: int, user: dict = Depends(require_admin)):
    pool = await get_connection()
    rows = await pool.fetch(
        """
        SELECT s.id, u.name, u.email, s.phone_number, gs.is_trial, gs.joined_at
        FROM group_students gs
        JOIN students s ON s.id = gs.student_id
        JOIN users u ON u.id = s.user_id
        WHERE gs.group_id = $1
        ORDER BY u.name
        """,
        group_id
    )
    return {
        "students": [
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
    }
@router.post("/groups/{group_id}/students")
async def add_student_to_group(group_id: int, data: AddStudentToGroupRequest, user: dict = Depends(require_admin)):
    pool = await get_connection()
    await pool.execute(
        """
        INSERT INTO group_students (group_id, student_id, is_trial)
        VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING
        """,
        group_id, data.student_id, data.is_trial
    )
    return {"message": "Student added to group"}
@router.delete("/groups/{group_id}/students/{student_id}")
async def remove_student_from_group(group_id: int, student_id: int, user: dict = Depends(require_admin)):
    pool = await get_connection()
    await pool.execute(
        "DELETE FROM group_students WHERE group_id = $1 AND student_id = $2",
        group_id, student_id
    )
    return {"message": "Student removed from group"}
@router.post("/groups/{group_id}/limit")
async def update_group_limit(group_id: int, data: GroupLimitRequest, user: dict = Depends(require_admin)):
    pool = await get_connection()
    await pool.execute(
        "UPDATE groups SET capacity = $1 WHERE id = $2",
        data.capacity, group_id
    )
    return {"message": "Group capacity updated"}
@router.post("/teachers/{teacher_id}/groups/{group_id}")
async def assign_teacher_to_group(teacher_id: int, group_id: int, user: dict = Depends(require_admin)):
    pool = await get_connection()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "UPDATE group_teachers SET is_main = FALSE WHERE group_id = $1",
                group_id
            )
            await conn.execute(
                """
                INSERT INTO group_teachers (group_id, teacher_id, is_main)
                VALUES ($1, $2, TRUE)
                ON CONFLICT (group_id, teacher_id) DO UPDATE SET is_main = TRUE
                """,
                group_id, teacher_id
            )
            await conn.execute(
                """
                UPDATE lessons
                SET teacher_id = $2
                WHERE group_id = $1 AND teacher_id IS NULL
                """,
                group_id, teacher_id
            )
    return {"message": "Teacher assigned to group"}
@router.post("/groups/{group_id}/teachers/{teacher_id}")
async def add_teacher_to_group(group_id: int, teacher_id: int, user: dict = Depends(require_admin)):
    pool = await get_connection()
    existing_count = await pool.fetchval(
        "SELECT COUNT(*) FROM group_teachers WHERE group_id = $1",
        group_id
    )
    is_main = existing_count == 0
    await pool.execute(
        """
        INSERT INTO group_teachers (group_id, teacher_id, is_main)
        VALUES ($1, $2, $3)
        ON CONFLICT (group_id, teacher_id) DO NOTHING
        """,
        group_id, teacher_id, is_main
    )
    return {"message": "Teacher added to group"}
@router.delete("/groups/{group_id}/teachers/{teacher_id}")
async def remove_teacher_from_group(group_id: int, teacher_id: int, user: dict = Depends(require_admin)):
    """Remove a teacher from a group"""
    pool = await get_connection()
    await pool.execute(
        "DELETE FROM group_teachers WHERE group_id = $1 AND teacher_id = $2",
        group_id, teacher_id
    )
    return {"message": "Teacher removed from group"}
@router.post("/groups/{group_id}/attendance")
async def save_attendance(group_id: int, data: SaveAttendanceRequest, user: dict = Depends(require_admin)):
    pool = await get_connection()
    async with pool.acquire() as conn:
        async with conn.transaction():
            for record in data.records:
                await conn.execute(
                    """
                    INSERT INTO attendance_records (group_id, student_id, attended, lesson_date)
                    VALUES ($1, $2, $3, $4)
                    """,
                    group_id, record.student_id, record.attended, data.lesson_date
                )
    return {"message": "Attendance saved"}
@router.post("/groups/{group_id}/schedule")
async def add_group_schedule(group_id: int, data: AddScheduleRequest, user: dict = Depends(require_admin)):
    pool = await get_connection()
    if data.day_of_week not in range(0, 7):
        raise HTTPException(status_code=400, detail="Invalid day_of_week. Must be 0-6 (Sunday-Saturday)")
    try:
        start_hours, start_minutes = map(int, data.start_time.split(":"))
        end_hours, end_minutes = map(int, data.end_time.split(":"))
        start_time = time(start_hours, start_minutes)
        end_time = time(end_hours, end_minutes)
        if start_time >= end_time:
            raise HTTPException(status_code=400, detail="Start time must be before end time")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid time format. Use HH:MM")
    group = await pool.fetchrow(
        """
        SELECT g.id, g.name, g.class_name, g.duration_minutes, g.hall_id, g.start_date, g.recurring_until,
               gt.teacher_id
        FROM groups g
        LEFT JOIN group_teachers gt ON gt.group_id = g.id AND gt.is_main = TRUE
        WHERE g.id = $1
        """,
        group_id
    )
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                """
                INSERT INTO group_schedules (group_id, day_of_week, start_time, end_time, is_active)
                VALUES ($1, $2, $3, $4, TRUE)
                ON CONFLICT (group_id, day_of_week)
                DO UPDATE SET start_time = $3, end_time = $4, is_active = TRUE
                """,
                group_id, data.day_of_week, start_time, end_time
            )
            if group["start_date"]:
                from datetime import datetime, timedelta
                start_date = group["start_date"]
                if group["recurring_until"]:
                    end_date = group["recurring_until"]
                else:
                    end_date = start_date + timedelta(days=90)
                current_date = max(start_date, datetime.now().date())
                target_weekday = (data.day_of_week - 1) % 7
                while current_date.weekday() != target_weekday:
                    current_date += timedelta(days=1)
                lessons_created = 0
                while current_date <= end_date and lessons_created < 20:
                    lesson_datetime = datetime.combine(current_date, start_time)
                    existing = await conn.fetchval(
                        "SELECT id FROM lessons WHERE group_id = $1 AND start_time = $2",
                        group_id, lesson_datetime
                    )
                    if not existing:
                        await conn.execute(
                            """
                            INSERT INTO lessons (group_id, class_name, teacher_id, hall_id, start_time, duration_minutes)
                            VALUES ($1, $2, $3, $4, $5, $6)
                            """,
                            group_id,
                            group["class_name"] or f"Занятие {group['name']}",
                            group["teacher_id"],
                            group["hall_id"],
                            lesson_datetime,
                            group["duration_minutes"] or 90
                        )
                        lessons_created += 1
                    current_date += timedelta(days=7)
        return {"message": f"Schedule added successfully. Created {lessons_created if 'lessons_created' in locals() else 0} lesson instances."}
@router.post("/groups/{group_id}/lessons")
async def create_group_lessons(group_id: int, data: CreateLessonScheduleRequest, user: dict = Depends(require_admin)):
    pool = await get_connection()
    try:
        from datetime import datetime, timedelta, time
        lesson_date = datetime.strptime(data.date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    try:
        start_hours, start_minutes = map(int, data.start_time.split(":"))
        end_hours, end_minutes = map(int, data.end_time.split(":"))
        start_time = time(start_hours, start_minutes)
        end_time = time(end_hours, end_minutes)
        if start_time >= end_time:
            raise HTTPException(status_code=400, detail="Start time must be before end time")
        start_datetime = datetime.combine(datetime.min, start_time)
        end_datetime = datetime.combine(datetime.min, end_time)
        duration_minutes = int((end_datetime - start_datetime).total_seconds() / 60)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid time format. Use HH:MM")
    group = await pool.fetchrow(
        """
        SELECT g.id, g.name, g.class_name, g.duration_minutes, g.hall_id, g.start_date, g.recurring_until,
               gt.teacher_id
        FROM groups g
        LEFT JOIN group_teachers gt ON gt.group_id = g.id AND gt.is_main = TRUE
        WHERE g.id = $1
        """,
        group_id
    )
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    async with pool.acquire() as conn:
        async with conn.transaction():
            lessons_created = 0
            python_weekday = lesson_date.weekday()
            day_of_week = (python_weekday + 1) % 7
            day_of_week = python_weekday + 1
            if day_of_week == 7:
                day_of_week = 0
            if not data.repeat_enabled:
                lesson_datetime = datetime.combine(lesson_date, start_time)
                lesson_end_datetime = datetime.combine(lesson_date, end_time)
                overlapping = await conn.fetchval(
                    """
                    SELECT id FROM lessons
                    WHERE group_id = $1
                    AND (
                        (start_time <= $2 AND start_time + INTERVAL '1 minute' * duration_minutes > $2) OR
                        (start_time < $3 AND start_time + INTERVAL '1 minute' * duration_minutes >= $3) OR
                        (start_time >= $2 AND start_time < $3)
                    )
                    """,
                    group_id, lesson_datetime, lesson_end_datetime
                )
                if overlapping:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Время занятия пересекается с уже существующим занятием. Выберите другое время."
                    )
                await conn.execute(
                    """
                    INSERT INTO lessons (group_id, class_name, teacher_id, hall_id, start_time, duration_minutes)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    """,
                    group_id,
                    group["class_name"] or f"Занятие {group['name']}",
                    group["teacher_id"],
                    group["hall_id"],
                    lesson_datetime,
                    duration_minutes
                )
                lessons_created = 1
            else:
                if not data.repeat_until:
                    raise HTTPException(status_code=400, detail="repeat_until is required for all recurring lessons. Please specify an end date.")
                try:
                    end_date = datetime.strptime(data.repeat_until, "%Y-%m-%d").date()
                except ValueError:
                    raise HTTPException(status_code=400, detail="Invalid repeat_until date format. Use YYYY-MM-DD")
                current_date = lesson_date
                while current_date <= end_date and lessons_created < 100:
                    from datetime import timedelta
                    lesson_datetime = datetime.combine(current_date, start_time)
                    lesson_end_datetime = datetime.combine(current_date, end_time)
                    overlapping = await conn.fetchval(
                        """
                        SELECT id FROM lessons
                        WHERE group_id = $1
                        AND (
                            (start_time <= $2 AND start_time + INTERVAL '1 minute' * duration_minutes > $2) OR
                            (start_time < $3 AND start_time + INTERVAL '1 minute' * duration_minutes >= $3) OR
                            (start_time >= $2 AND start_time < $3)
                        )
                        """,
                        group_id, lesson_datetime, lesson_end_datetime
                    )
                    if not overlapping:
                        await conn.execute(
                            """
                            INSERT INTO lessons (group_id, class_name, teacher_id, hall_id, start_time, duration_minutes)
                            VALUES ($1, $2, $3, $4, $5, $6)
                            """,
                            group_id,
                            group["class_name"] or f"Занятие {group['name']}",
                            group["teacher_id"],
                            group["hall_id"],
                            lesson_datetime,
                            duration_minutes
                        )
                        lessons_created += 1
                    if data.repeat_frequency == "weekly":
                        current_date += timedelta(weeks=1)
                    elif data.repeat_frequency == "biweekly":
                        current_date += timedelta(weeks=2)
                    elif data.repeat_frequency == "monthly":
                        if current_date.month == 12:
                            current_date = current_date.replace(year=current_date.year + 1, month=1)
                        else:
                            current_date = current_date.replace(month=current_date.month + 1)
                    else:
                        break
            await sync_group_schedules_with_lessons(conn, group_id)
            return {"message": f"Created {lessons_created} lesson(s) successfully"}
@router.get("/reschedule-requests")
async def get_reschedule_requests(user: dict = Depends(require_admin)):
    pool = await get_connection()
    requests = await pool.fetch("""
        SELECT rr.id, rr.lesson_id, rr.new_date, rr.new_time, rr.new_start_time, rr.reason,
               rr.status, rr.created_at, rr.reviewed_at,
               COALESCE(rr.original_time, l.start_time) as original_time,
               l.class_name,
               g.name as group_name,
               u.name as requested_by,
               t.name as teacher_name
        FROM reschedule_requests rr
        JOIN lessons l ON rr.lesson_id = l.id
        JOIN groups g ON l.group_id = g.id
        JOIN users u ON rr.requested_by_user_id = u.id
        LEFT JOIN teachers tc ON l.teacher_id = tc.id
        LEFT JOIN users t ON tc.user_id = t.id
        ORDER BY rr.created_at DESC
    """)
    formatted_requests = []
    for r in requests:
        formatted_requests.append({
            "id": r["id"],
            "lesson_id": r["lesson_id"],
            "class_name": r["class_name"],
            "group_name": r["group_name"],
            "teacher_name": r["teacher_name"],
            "requested_by": r["requested_by"],
            "current_time": r["original_time"].isoformat() if r["original_time"] else None,
            "new_date": r["new_date"].isoformat() if r["new_date"] else None,
            "new_time": r["new_time"].strftime("%H:%M") if r["new_time"] else None,
            "new_start_time": r["new_start_time"].isoformat() if r["new_start_time"] else None,
            "reason": r["reason"],
            "status": r["status"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            "reviewed_at": r["reviewed_at"].isoformat() if r["reviewed_at"] else None
        })
    return {"requests": formatted_requests}

@router.post("/reschedule-requests/{request_id}/approve")
async def approve_reschedule_request(request_id: int, user: dict = Depends(require_admin)):
    pool = await get_connection()
    request_details = await pool.fetchrow("""
        SELECT rr.id, rr.lesson_id, rr.new_date, rr.new_time, rr.new_start_time, rr.reason,
               rr.requested_by_user_id, rr.teacher_id,
               l.start_time as current_start_time, l.class_name,
               g.id as group_id, g.name as group_name
        FROM reschedule_requests rr
        JOIN lessons l ON rr.lesson_id = l.id
        JOIN groups g ON l.group_id = g.id
        WHERE rr.id = $1
    """, request_id)
    if not request_details:
        raise HTTPException(status_code=404, detail="Request not found")
    from datetime import datetime, time as dt_time
    from app.notifications import create_notification, notify_group_students, NotificationType
    new_datetime = request_details["new_start_time"]
    if not new_datetime:
        new_date_val = request_details.get("new_date")
        new_time_val = request_details.get("new_time")
        if new_date_val and new_time_val:
            new_datetime = datetime.combine(new_date_val, new_time_val)
        else:
            raise HTTPException(status_code=400, detail="No new date/time specified for this reschedule request")
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "UPDATE reschedule_requests SET status = 'approved', reviewed_at = NOW(), reviewed_by = $2 WHERE id = $1",
                request_id, user["id"]
            )
            await conn.execute(
                "UPDATE lessons SET start_time = $1, is_rescheduled = TRUE WHERE id = $2",
                new_datetime, request_details["lesson_id"]
            )
    requester_id = request_details["requested_by_user_id"]
    if not requester_id and request_details["teacher_id"]:
        teacher_user = await pool.fetchrow(
            "SELECT user_id FROM teachers WHERE id = $1",
            request_details["teacher_id"]
        )
        if teacher_user:
            requester_id = teacher_user["user_id"]
    if requester_id:
        await create_notification(
            user_id=requester_id,
            notification_type=NotificationType.RESCHEDULE_REQUEST_APPROVED,
            title="Заявка на перенос одобрена",
            message=f"Ваша заявка на перенос занятия '{request_details['group_name']}' была одобрена. Новое время: {new_datetime.strftime('%d.%m.%Y в %H:%M')}",
            group_id=request_details["group_id"],
            related_id=request_id,
            related_type="reschedule_request",
            action_url=f"/teacher-groups/manage-group/{request_details['group_id']}"
        )
    await notify_group_students(
        group_id=request_details["group_id"],
        notification_type=NotificationType.LESSON_RESCHEDULED,
        title="Занятие перенесено",
        message=f"Занятие '{request_details['group_name']}' перенесено на {new_datetime.strftime('%d.%m.%Y в %H:%M')}",
        related_id=request_details["lesson_id"],
        related_type="lesson",
        action_url=f"/my-groups"
    )
    return {"message": "Reschedule request approved and lesson updated"}

@router.post("/reschedule-requests/{request_id}/reject")
async def reject_reschedule_request(request_id: int, user: dict = Depends(require_admin)):
    pool = await get_connection()
    request_details = await pool.fetchrow("""
        SELECT rr.id, rr.lesson_id, rr.requested_by_user_id, rr.teacher_id,
               rr.new_date, rr.new_time,
               l.start_time as current_time, l.class_name,
               g.id as group_id, g.name as group_name
        FROM reschedule_requests rr
        JOIN lessons l ON rr.lesson_id = l.id
        JOIN groups g ON l.group_id = g.id
        WHERE rr.id = $1
    """, request_id)
    if not request_details:
        raise HTTPException(status_code=404, detail="Request not found")
    await pool.execute(
        "UPDATE reschedule_requests SET status = 'rejected', reviewed_at = NOW(), reviewed_by = $2 WHERE id = $1",
        request_id, user["id"]
    )
    from app.notifications import create_notification, NotificationType
    requester_id = request_details["requested_by_user_id"]
    if not requester_id and request_details["teacher_id"]:
        teacher_user = await pool.fetchrow(
            "SELECT user_id FROM teachers WHERE id = $1",
            request_details["teacher_id"]
        )
        if teacher_user:
            requester_id = teacher_user["user_id"]
    if requester_id:
        await create_notification(
            user_id=requester_id,
            notification_type=NotificationType.RESCHEDULE_REQUEST_REJECTED,
            title="Заявка на перенос отклонена",
            message=f"Ваша заявка на перенос занятия '{request_details['group_name']}' была отклонена администратором.",
            group_id=request_details["group_id"],
            related_id=request_id,
            related_type="reschedule_request",
            action_url=f"/teacher-groups/manage-group/{request_details['group_id']}"
        )
    return {"message": "Reschedule request rejected"}

@router.get("/lessons")
async def get_lessons(user: dict = Depends(require_admin)):
    pool = await get_connection()
    rows = await pool.fetch(
        """
        SELECT
            l.id, l.group_id, l.class_name, l.start_time, l.duration_minutes,
            l.is_cancelled, l.is_rescheduled,
            g.name AS group_name,
            h.name AS hall_name,
            u.name AS teacher_name
        FROM lessons l
        LEFT JOIN groups g ON g.id = l.group_id
        LEFT JOIN halls h ON h.id = l.hall_id
        LEFT JOIN teachers t ON t.id = l.teacher_id
        LEFT JOIN users u ON u.id = t.user_id
        ORDER BY l.start_time DESC
        """
    )
    return {
        "lessons": [
            {
                "id": r["id"],
                "group_id": r["group_id"],
                "group_name": r["group_name"],
                "class_name": r["class_name"],
                "start_time": str(r["start_time"]) if r["start_time"] else None,
                "duration_minutes": r["duration_minutes"],
                "is_cancelled": r["is_cancelled"],
                "is_rescheduled": r["is_rescheduled"],
                "hall_name": r["hall_name"],
                "teacher_name": r["teacher_name"]
            }
            for r in rows
        ]
    }
@router.post("/lessons")
async def create_lesson(data: CreateLessonRequest, user: dict = Depends(require_admin)):
    pool = await get_connection()
    result = await pool.fetchrow(
        """
        INSERT INTO lessons (group_id, class_name, teacher_id, hall_id, start_time, duration_minutes)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
        """,
        data.group_id, data.class_name, data.teacher_id, data.hall_id,
        data.start_time, data.duration_minutes
    )
    return {"lesson_id": result["id"]}

@router.put("/lessons/{lesson_id}")
async def update_lesson(lesson_id: int, data: UpdateLessonRequest, user: dict = Depends(require_admin_or_teacher)):
    pool = await get_connection()
    updates = []
    values = []
    param_count = 1
    if data.class_name is not None:
        updates.append(f"class_name = ${param_count}")
        values.append(data.class_name)
        param_count += 1
    if data.teacher_id is not None:
        updates.append(f"teacher_id = ${param_count}")
        values.append(data.teacher_id)
        param_count += 1
    if data.hall_id is not None:
        updates.append(f"hall_id = ${param_count}")
        values.append(data.hall_id)
        param_count += 1
    if data.start_time is not None:
        updates.append(f"start_time = ${param_count}")
        values.append(data.start_time)
        param_count += 1
    if data.duration_minutes is not None:
        updates.append(f"duration_minutes = ${param_count}")
        values.append(data.duration_minutes)
        param_count += 1
    if data.is_cancelled is not None:
        updates.append(f"is_cancelled = ${param_count}")
        values.append(data.is_cancelled)
        param_count += 1
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    values.append(lesson_id)
    await pool.execute(
        f"UPDATE lessons SET {', '.join(updates)} WHERE id = ${param_count}",
        *values
    )
    return {"message": "Lesson updated"}

@router.delete("/lessons/{lesson_id}")
async def delete_lesson(lesson_id: int, user: dict = Depends(require_admin_or_teacher)):
    pool = await get_connection()
    from app.notifications import create_notification, NotificationType
    lesson = await pool.fetchrow(
        """
        SELECT l.group_id, l.start_time, l.class_name,
               g.name as group_name,
               t.id as teacher_id, tu.id as teacher_user_id, tu.name as teacher_name
        FROM lessons l
        JOIN groups g ON g.id = l.group_id
        LEFT JOIN teachers t ON t.id = l.teacher_id
        LEFT JOIN users tu ON tu.id = t.user_id
        WHERE l.id = $1
        """,
        lesson_id
    )
    group_id = lesson["group_id"] if lesson else None
    await pool.execute("DELETE FROM lessons WHERE id = $1", lesson_id)
    if group_id:
        await sync_group_schedules_with_lessons(pool, group_id)
    if lesson:
        from datetime import timedelta
        local_time = lesson["start_time"] + timedelta(hours=5)
        lesson_date = local_time.strftime("%d.%m.%Y в %H:%M")
        group_name = lesson["group_name"]
        if lesson["teacher_user_id"]:
            await create_notification(
                user_id=lesson["teacher_user_id"],
                notification_type=NotificationType.LESSON_CANCELLED,
                title="Занятие удалено",
                message=f"Занятие группы \"{group_name}\" на {lesson_date} было удалено из расписания",
                group_id=lesson["group_id"],
                related_type="lesson"
            )
        students = await pool.fetch(
            """
            SELECT s.id, u.id as user_id, u.name
            FROM group_students gs
            JOIN students s ON s.id = gs.student_id
            JOIN users u ON u.id = s.user_id
            WHERE gs.group_id = $1
            """,
            lesson["group_id"]
        )
        for student in students:
            await create_notification(
                user_id=student["user_id"],
                notification_type=NotificationType.LESSON_CANCELLED,
                title="Занятие удалено",
                message=f"Занятие группы \"{group_name}\" на {lesson_date} было удалено из расписания",
                group_id=lesson["group_id"],
                related_type="lesson",
                student_id=student["id"]
            )
    return {"message": "Lesson deleted"}

@router.post("/lessons/{lesson_id}/cancel")
async def cancel_lesson(lesson_id: int, user: dict = Depends(require_admin)):
    pool = await get_connection()
    from app.notifications import create_notification, NotificationType
    lesson = await pool.fetchrow(
        """
        SELECT l.group_id, l.start_time, l.class_name,
               g.name as group_name,
               t.id as teacher_id, tu.id as teacher_user_id, tu.name as teacher_name
        FROM lessons l
        JOIN groups g ON g.id = l.group_id
        LEFT JOIN teachers t ON t.id = l.teacher_id
        LEFT JOIN users tu ON tu.id = t.user_id
        WHERE l.id = $1
        """,
        lesson_id
    )
    await pool.execute(
        "UPDATE lessons SET is_cancelled = TRUE WHERE id = $1",
        lesson_id
    )
    if lesson:
        from datetime import timedelta
        local_time = lesson["start_time"] + timedelta(hours=5)
        lesson_date = local_time.strftime("%d.%m.%Y в %H:%M")
        group_name = lesson["group_name"]
        if lesson["teacher_user_id"]:
            await create_notification(
                user_id=lesson["teacher_user_id"],
                notification_type=NotificationType.LESSON_CANCELLED,
                title="Занятие отменено",
                message=f"Занятие группы \"{group_name}\" на {lesson_date} было отменено",
                group_id=lesson["group_id"],
                related_id=lesson_id,
                related_type="lesson"
            )
        students = await pool.fetch(
            """
            SELECT s.id, u.id as user_id, u.name
            FROM group_students gs
            JOIN students s ON s.id = gs.student_id
            JOIN users u ON u.id = s.user_id
            WHERE gs.group_id = $1
            """,
            lesson["group_id"]
        )
        for student in students:
            await create_notification(
                user_id=student["user_id"],
                notification_type=NotificationType.LESSON_CANCELLED,
                title="Занятие отменено",
                message=f"Занятие группы \"{group_name}\" на {lesson_date} было отменено",
                group_id=lesson["group_id"],
                related_id=lesson_id,
                related_type="lesson",
                student_id=student["id"]
            )
    return {"message": "Lesson cancelled"}

@router.post("/lessons/{lesson_id}/reschedule")
async def reschedule_lesson(
    lesson_id: int,
    data: RescheduleLessonRequest,
    user: dict = Depends(require_admin)
):
    pool = await get_connection()
    from datetime import datetime, timedelta
    from app.notifications import create_notification, NotificationType
    lesson = await pool.fetchrow(
        """
        SELECT l.group_id, l.start_time, l.class_name, l.duration_minutes,
               g.name as group_name,
               t.id as teacher_id, tu.id as teacher_user_id, tu.name as teacher_name
        FROM lessons l
        JOIN groups g ON g.id = l.group_id
        LEFT JOIN teachers t ON t.id = l.teacher_id
        LEFT JOIN users tu ON tu.id = t.user_id
        WHERE l.id = $1
        """,
        lesson_id
    )
    if not lesson:
        raise HTTPException(status_code=404, detail="Урок не найден")
    new_datetime = data.new_start_time
    if isinstance(new_datetime, str):
        new_datetime = datetime.strptime(new_datetime, "%Y-%m-%d %H:%M:%S")
    duration = lesson["duration_minutes"] or 60
    new_end_time = new_datetime + timedelta(minutes=duration)
    conflicting_lesson = await pool.fetchrow(
        """
        SELECT l.id, l.start_time, l.duration_minutes, g.name as group_name
        FROM lessons l
        JOIN groups g ON g.id = l.group_id
        WHERE l.group_id = $1
          AND l.id != $2
          AND l.start_time < $4
          AND (l.start_time + (COALESCE(l.duration_minutes, 60) * INTERVAL '1 minute')) > $3
        """,
        lesson["group_id"], lesson_id, new_datetime, new_end_time
    )
    if conflicting_lesson:
        conflict_time = conflicting_lesson["start_time"]
        if conflict_time:
            conflict_local = conflict_time + timedelta(hours=5)
            conflict_str = conflict_local.strftime("%H:%M")
            raise HTTPException(
                status_code=400,
                detail=f"Время пересекается с другим занятием этой группы в {conflict_str} у того же преподавателя"
            )
        else:
            raise HTTPException(
                status_code=400,
                detail="Время пересекается с другим занятием этой группы"
            )
    await pool.execute(
        """
        UPDATE lessons
        SET start_time = $2, is_rescheduled = TRUE
        WHERE id = $1
        """,
        lesson_id, new_datetime
    )
    if lesson:
        from datetime import timedelta
        old_local_time = lesson["start_time"] + timedelta(hours=5)
        new_local_time = new_datetime + timedelta(hours=5)
        old_date = old_local_time.strftime("%d.%m.%Y в %H:%M")
        new_date = new_local_time.strftime("%d.%m.%Y в %H:%M")
        group_name = lesson["group_name"]
        if lesson["teacher_user_id"]:
            await create_notification(
                user_id=lesson["teacher_user_id"],
                notification_type=NotificationType.LESSON_RESCHEDULED,
                title="Занятие перенесено",
                message=f"Занятие группы '{group_name}' перенесено с {old_date} на {new_date}",
                group_id=lesson["group_id"],
                related_id=lesson_id,
                related_type="lesson"
            )
        students = await pool.fetch(
            """
            SELECT s.id, u.id as user_id, u.name
            FROM group_students gs
            JOIN students s ON s.id = gs.student_id
            JOIN users u ON u.id = s.user_id
            WHERE gs.group_id = $1
            """,
            lesson["group_id"]
        )
        for student in students:
            await create_notification(
                user_id=student["user_id"],
                notification_type=NotificationType.LESSON_RESCHEDULED,
                title="Занятие перенесено",
                message=f"Занятие группы '{group_name}' перенесено с {old_date} на {new_date}",
                group_id=lesson["group_id"],
                related_id=lesson_id,
                related_type="lesson",
                student_id=student["id"]
            )
    return {"message": "Lesson rescheduled"}
@router.post("/lessons/{lesson_id}/substitute")
async def set_substitute_teacher(
    lesson_id: int,
    data: SubstituteTeacherRequest,
    user: dict = Depends(require_admin)
):
    pool = await get_connection()
    from app.notifications import create_notification, NotificationType
    lesson = await pool.fetchrow(
        """
        SELECT l.group_id, l.start_time, l.class_name,
               g.name as group_name,
               t.id as teacher_id, tu.id as teacher_user_id, tu.name as teacher_name,
               st.id as sub_teacher_id, stu.id as sub_user_id, stu.name as sub_name
        FROM lessons l
        JOIN groups g ON g.id = l.group_id
        LEFT JOIN teachers t ON t.id = l.teacher_id
        LEFT JOIN users tu ON tu.id = t.user_id
        LEFT JOIN teachers st ON st.id = $2
        LEFT JOIN users stu ON stu.id = st.user_id
        WHERE l.id = $1
        """,
        lesson_id, data.substitute_teacher_id
    )
    await pool.execute(
        "UPDATE lessons SET substitute_teacher_id = $2 WHERE id = $1",
        lesson_id, data.substitute_teacher_id
    )
    if lesson:
        from datetime import timedelta
        local_time = lesson["start_time"] + timedelta(hours=5)
        lesson_date = local_time.strftime("%d.%m.%Y в %H:%M")
        group_name = lesson["group_name"]
        if lesson["teacher_user_id"]:
            await create_notification(
                user_id=lesson["teacher_user_id"],
                notification_type=NotificationType.SYSTEM,
                title="Назначена замена",
                message=f"Ваше занятие в группе \"{group_name}\" в {lesson_date}, было передано учителю {lesson['sub_name']}",
                group_id=lesson["group_id"],
                related_id=lesson_id,
                related_type="lesson"
            )
        if lesson["sub_user_id"]:
            await create_notification(
                user_id=lesson["sub_user_id"],
                notification_type=NotificationType.SYSTEM,
                title="Вы назначены на замену",
                message=f"Вам было передано занятие учителя {lesson['teacher_name']} в группе \"{group_name}\" {lesson_date}",
                group_id=lesson["group_id"],
                related_id=lesson_id,
                related_type="lesson"
            )
        students = await pool.fetch(
            """
            SELECT s.id, u.id as user_id, u.name
            FROM group_students gs
            JOIN students s ON s.id = gs.student_id
            JOIN users u ON u.id = s.user_id
            WHERE gs.group_id = $1
            """,
            lesson["group_id"]
        )
        for student in students:
            await create_notification(
                user_id=student["user_id"],
                notification_type=NotificationType.SYSTEM,
                title="Замена преподавателя",
                message=f"На занятии группы '{group_name}' ({lesson_date}) будет замена: {lesson['sub_name']}",
                group_id=lesson["group_id"],
                related_id=lesson_id,
                related_type="lesson",
                student_id=student["id"]
            )
    return {"message": "Substitute teacher assigned"}
@router.post("/generate-lesson-instances")
async def generate_lesson_instances(user: dict = Depends(require_admin)):
    from datetime import datetime, timedelta
    pool = await get_connection()
    today = datetime.now().date()
    day_of_week = today.weekday()
    week_start = today - timedelta(days=day_of_week)
    week_end = week_start + timedelta(days=6)
    groups_with_schedules = await pool.fetch(
        """
        SELECT
            g.id as group_id, g.name as group_name, g.class_name, g.duration_minutes,
            h.id as hall_id,
            t.id as teacher_id,
            gs.day_of_week, gs.start_time
        FROM groups g
        JOIN group_schedules gs ON gs.group_id = g.id AND gs.is_active = TRUE
        LEFT JOIN group_teachers gt ON gt.group_id = g.id AND gt.is_main = TRUE
        LEFT JOIN teachers t ON t.id = gt.teacher_id
        LEFT JOIN halls h ON h.id = g.hall_id
        WHERE g.is_closed = FALSE
        """
    )
    created_count = 0
    for group_schedule in groups_with_schedules:
        day_of_week = group_schedule["day_of_week"]
        start_time = group_schedule["start_time"]
        if not start_time:
            continue
        if day_of_week == 0:
            python_weekday = 6
        else:
            python_weekday = day_of_week - 1
        days_ahead = python_weekday - week_start.weekday()
        if days_ahead < 0:
            days_ahead += 7
        target_date = week_start + timedelta(days=days_ahead)
        target_datetime = datetime.combine(target_date, start_time)
        existing = await pool.fetchval(
            "SELECT id FROM lessons WHERE group_id = $1 AND start_time = $2",
            group_schedule["group_id"], target_datetime
        )
        if not existing:
            try:
                await pool.execute(
                    """
                    INSERT INTO lessons (group_id, class_name, teacher_id, hall_id, start_time, duration_minutes)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    """,
                    group_schedule["group_id"],
                    group_schedule["class_name"] or f"Занятие {group_schedule['group_name']}",
                    group_schedule["teacher_id"],
                    group_schedule["hall_id"],
                    target_datetime,
                    group_schedule["duration_minutes"] or 60
                )
                created_count += 1
            except Exception as e:
                print(f"Failed to create lesson for group {group_schedule['group_id']}: {e}")
    return {"message": f"Generated {created_count} lesson instances for current week"}
@router.get("/groups/{group_id}/lessons-attendance")
async def get_group_lessons_for_attendance(group_id: int, user: dict = Depends(require_admin_or_teacher)):
    pool = await get_connection()
    lessons = await pool.fetch("""
        SELECT l.id, l.class_name, l.start_time, l.duration_minutes,
               g.name as group_name,
               u.name as teacher_name,
               l.is_rescheduled
        FROM lessons l
        JOIN groups g ON l.group_id = g.id
        LEFT JOIN teachers t ON l.teacher_id = t.id
        LEFT JOIN users u ON t.user_id = u.id
        WHERE l.group_id = $1
        ORDER BY l.start_time ASC
    """, group_id)
    students = await pool.fetch("""
        SELECT s.id, u.name, u.email
        FROM group_students gs
        JOIN students s ON gs.student_id = s.id
        JOIN users u ON s.user_id = u.id
        WHERE gs.group_id = $1
        ORDER BY u.name
    """, group_id)
    lesson_ids = [lesson['id'] for lesson in lessons]
    reschedule_requests = {}
    if lesson_ids:
        requests = await pool.fetch("""
            SELECT lesson_id, status, new_date, new_time, created_at
            FROM reschedule_requests
            WHERE lesson_id = ANY($1)
            ORDER BY lesson_id, created_at DESC
        """, lesson_ids)
        lesson_requests = {}
        for req in requests:
            lesson_id = req['lesson_id']
            if lesson_id not in lesson_requests:
                lesson_requests[lesson_id] = []
            lesson_requests[lesson_id].append(req)
        for lesson_id, reqs in lesson_requests.items():
            if reqs:
                latest_req = reqs[0]
                reschedule_requests[lesson_id] = {
                    'status': latest_req['status'],
                    'new_date': latest_req['new_date'].isoformat() if latest_req['new_date'] else None,
                    'new_time': latest_req['new_time'].isoformat() if latest_req['new_time'] else None
                }
    lessons_with_attendance = []
    for lesson in lessons:
        attendance_records = await pool.fetch("""
            SELECT student_id, status
            FROM attendance_records
            WHERE lesson_id = $1
        """, lesson['id'])
        attendance_dict = {record['student_id']: record['status'] for record in attendance_records}
        student_attendance = []
        for student in students:
            student_attendance.append({
                "id": student["id"],
                "name": student["name"],
                "email": student["email"],
                "status": attendance_dict.get(student["id"])
            })
        reschedule_info = reschedule_requests.get(lesson["id"])
        lessons_with_attendance.append({
            "id": lesson["id"],
            "class_name": lesson["class_name"],
            "start_time": lesson["start_time"].isoformat(),
            "duration_minutes": lesson["duration_minutes"],
            "teacher_name": lesson["teacher_name"],
            "students": student_attendance,
            "attendance_marked": len(attendance_dict) > 0,
            "is_rescheduled": lesson["is_rescheduled"],
            "reschedule_status": reschedule_info["status"] if reschedule_info else None,
            "reschedule_new_date": reschedule_info["new_date"] if reschedule_info else None,
            "reschedule_new_time": reschedule_info["new_time"] if reschedule_info else None
        })
    return {
        "group_name": lessons[0]["group_name"] if lessons else "",
        "lessons": lessons_with_attendance
    }
@router.post("/groups/{group_id}/lessons/{lesson_id}/attendance")
async def save_lesson_attendance(
    group_id: int,
    lesson_id: int,
    data: SaveLessonAttendanceRequest,
    user: dict = Depends(require_admin_or_teacher)
):
    pool = await get_connection()
    lesson = await pool.fetchrow("""
        SELECT id FROM lessons
        WHERE id = $1 AND group_id = $2
    """, lesson_id, group_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    valid_statuses = {'P', 'E', 'L', 'A'}
    for record in data.attendance:
        if record.status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status: {record.status}")
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("""
                DELETE FROM attendance_records
                WHERE lesson_id = $1
            """, lesson_id)
            for record in data.attendance:
                attended = record.status in ['P', 'E']
                await conn.execute("""
                    INSERT INTO attendance_records
                    (lesson_id, group_id, student_id, status, attended, recorded_at)
                    VALUES ($1, $2, $3, $4, $5, NOW())
                """, lesson_id, group_id, record.student_id, record.status, attended)
    return {"message": "Attendance saved successfully"}
@router.get("/groups/{group_id}/lessons/{lesson_id}/attendance")
async def get_lesson_attendance(
    group_id: int,
    lesson_id: int,
    user: dict = Depends(require_admin_or_teacher)
):
    pool = await get_connection()
    lesson = await pool.fetchrow("""
        SELECT id FROM lessons
        WHERE id = $1 AND group_id = $2
    """, lesson_id, group_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    students = await pool.fetch("""
        SELECT
            s.id,
            u.name,
            u.email,
            ar.status,
            ar.recorded_at
        FROM group_students gs
        JOIN students s ON s.id = gs.student_id
        JOIN users u ON u.id = s.user_id
        LEFT JOIN attendance_records ar ON ar.student_id = s.id
            AND ar.lesson_id = $1
        WHERE gs.group_id = $2 AND gs.is_trial = FALSE
        ORDER BY u.name
    """, lesson_id, group_id)
    students_data = []
    for row in students:
        students_data.append({
            "id": row["id"],
            "name": row["name"],
            "email": row["email"],
            "status": row["status"],
            "recorded_at": row["recorded_at"].isoformat() if row["recorded_at"] else None
        })
    return {"students": students_data}
@router.get("/groups/{group_id}/attendance-summary")
async def get_group_attendance_summary(group_id: int, user: dict = Depends(require_admin)):
    pool = await get_connection()
    summary = await pool.fetch("""
        SELECT
            s.id,
            u.name,
            u.email,
            COUNT(ar.id) as lessons_total,
            COUNT(CASE WHEN ar.status = 'P' THEN 1 END) as present_count,
            COUNT(CASE WHEN ar.status = 'E' THEN 1 END) as excused_count,
            COUNT(CASE WHEN ar.status = 'L' THEN 1 END) as late_count,
            COUNT(CASE WHEN ar.status = 'A' THEN 1 END) as absent_count,
            -- Calculate score: P=2, E=2, L=1, A=0
            CASE
                WHEN COUNT(ar.id) = 0 THEN 0
                ELSE ROUND(
                    (COUNT(CASE WHEN ar.status = 'P' THEN 1 END) * 2.0 +
                     COUNT(CASE WHEN ar.status = 'E' THEN 1 END) * 2.0 +
                     COUNT(CASE WHEN ar.status = 'L' THEN 1 END) * 1.0 +
                     COUNT(CASE WHEN ar.status = 'A' THEN 1 END) * 0.0)
                    / (COUNT(ar.id) * 2.0) * 100, 1
                )
            END as attendance_percentage
        FROM group_students gs
        JOIN students s ON gs.student_id = s.id
        JOIN users u ON s.user_id = u.id
        LEFT JOIN attendance_records ar ON ar.student_id = s.id AND ar.group_id = $1
        WHERE gs.group_id = $1
        GROUP BY s.id, u.name, u.email
        ORDER BY u.name
    """, group_id)
    return {
        "students": [
            {
                "id": row["id"],
                "name": row["name"],
                "email": row["email"],
                "lessons_total": row["lessons_total"],
                "present_count": row["present_count"],
                "excused_count": row["excused_count"],
                "late_count": row["late_count"],
                "absent_count": row["absent_count"],
                "attendance_percentage": float(row["attendance_percentage"])
            }
            for row in summary
        ]
    }
class RescheduleRequest(BaseModel):
    lesson_id: int
    new_date: str
    new_time: str
    reason: str
@router.post("/lessons/{lesson_id}/reschedule-request")
async def request_lesson_reschedule(lesson_id: int, request: RescheduleRequest, user=Depends(require_admin_or_teacher)):
    async with get_connection() as conn:
        lesson_check = await conn.fetchrow("""
            SELECT l.id, l.class_name, l.start_time, g.name as group_name, g.id as group_id,
                   t.name as teacher_name
            FROM lessons l
            JOIN groups g ON l.group_id = g.id
            LEFT JOIN teachers tc ON g.teacher_id = tc.id
            LEFT JOIN users t ON tc.user_id = t.id
            WHERE l.id = $1
        """, lesson_id)
        if not lesson_check:
            raise HTTPException(status_code=404, detail="Lesson not found")
        if user["role"] == "teacher":
            user_teacher = await conn.fetchrow("""
                SELECT id FROM teachers WHERE user_id = $1
            """, user["user_id"])
            if not user_teacher:
                raise HTTPException(status_code=403, detail="Teacher not found")
            group_teacher = await conn.fetchrow("""
                SELECT teacher_id FROM groups WHERE id = $1
            """, lesson_check["group_id"])
            if not group_teacher or group_teacher["teacher_id"] != user_teacher["id"]:
                raise HTTPException(status_code=403, detail="Not authorized to reschedule this lesson")
        await conn.execute("""
            INSERT INTO reschedule_requests (
                lesson_id,
                requested_by_user_id,
                new_date,
                new_time,
                reason,
                status,
                created_at
            ) VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
        """, lesson_id, user["user_id"], request.new_date, request.new_time, request.reason)
        return {"message": "Reschedule request submitted successfully", "status": "pending"}
class TeacherRescheduleRequest(BaseModel):
    new_date: str
    new_time: str
    reason: Optional[str] = None
@router.post("/lessons/{lesson_id}/reschedule-request")
async def submit_lesson_reschedule_request(
    lesson_id: int,
    data: TeacherRescheduleRequest,
    user: dict = Depends(require_admin_or_teacher)
):
    pool = await get_connection()
    try:
        print(f"Reschedule request - lesson_id: {lesson_id}, user: {user}, data: {data}")
        try:
            lesson = await pool.fetchrow(
                """
                SELECT l.id, l.start_time, l.duration_minutes, l.group_id, l.teacher_id,
                       g.name as group_name, u.name as teacher_name
                FROM lessons l
                LEFT JOIN groups g ON l.group_id = g.id
                LEFT JOIN teachers t ON l.teacher_id = t.id
                LEFT JOIN users u ON t.user_id = u.id
                WHERE l.id = $1
                """,
                lesson_id
            )
            print(f"Found lesson: {lesson}")
        except Exception as db_error:
            print(f"Database error while fetching lesson: {db_error}")
            raise HTTPException(status_code=500, detail=f"Database error: {str(db_error)}")
        if not lesson:
            print(f"Lesson {lesson_id} not found")
            raise HTTPException(status_code=404, detail="Lesson not found")
        if user["role"] == "teacher":
            print(f"Checking if teacher {user['id']} is assigned to group {lesson['group_id']}")
            teacher_in_group = await pool.fetchrow(
                """
                SELECT 1 FROM group_teachers gt
                JOIN teachers t ON gt.teacher_id = t.id
                WHERE gt.group_id = $1 AND t.user_id = $2
                """,
                lesson["group_id"],
                user["id"]
            )
            if not teacher_in_group:
                print("Permission denied: teacher is not assigned to this group")
                raise HTTPException(status_code=403, detail="Teachers can only reschedule lessons for groups they are assigned to")
        print(f"Teacher requesting reschedule for lesson: {lesson}")
        try:
            existing_request = await pool.fetchrow(
                "SELECT id FROM teacher_reschedule_requests WHERE lesson_id = $1 AND status = 'pending'",
                lesson_id
            )
            print(f"Existing teacher reschedule request check: {existing_request}")
        except Exception as db_error:
            print(f"Database error while checking existing requests: {db_error}")
            try:
                await pool.execute("""
                    CREATE TABLE IF NOT EXISTS teacher_reschedule_requests (
                        id SERIAL PRIMARY KEY,
                        lesson_id INT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
                        requested_by_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        new_date DATE NOT NULL,
                        new_time TIME NOT NULL,
                        reason TEXT NOT NULL,
                        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
                        admin_response TEXT,
                        reviewed_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
                        reviewed_at TIMESTAMPTZ,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                """)
                print("Created teacher_reschedule_requests table")
                existing_request = None
            except Exception as create_error:
                print(f"Error creating teacher reschedule table: {create_error}")
                raise HTTPException(status_code=500, detail=f"Database error: {str(create_error)}")
        if existing_request:
            print("Found existing pending request")
            raise HTTPException(status_code=400, detail="There is already a pending reschedule request for this lesson")
        from datetime import datetime, time
        print(f"Parsing date: {data.new_date}, time: {data.new_time}")
        new_date = datetime.strptime(data.new_date, "%Y-%m-%d").date()
        new_time = datetime.strptime(data.new_time, "%H:%M").time()
        print(f"Parsed date: {new_date}, time: {new_time}")
        print("Inserting teacher reschedule request into database...")
        request_id = await pool.fetchval(
            """
            INSERT INTO teacher_reschedule_requests
            (lesson_id, requested_by_user_id, new_date, new_time, reason, status, created_at)
            VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
            RETURNING id
            """,
            lesson_id,
            user["id"],
            new_date,
            new_time,
            data.reason or "Reschedule request"
        )
        print(f"Successfully created teacher reschedule request with ID: {request_id}")
        return {
            "message": "Reschedule request submitted successfully",
            "request_id": request_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error submitting reschedule request: {str(e)}")
class UpdateUserRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    @field_validator('role')
    @classmethod
    def validate_role(cls, v):
        if v is not None and v not in ('student', 'teacher', 'admin'):
            raise ValueError(f"Invalid role: {v}. Must be one of: student, teacher, admin")
        return v
@router.get("/users")
async def get_all_users(user: dict = Depends(require_admin)):
    pool = await get_connection()
    rows = await pool.fetch(
        """
        SELECT
            u.id,
            u.name,
            u.email,
            u.role,
            u.created_at,
            s.phone_number,
            s.id as student_id,
            t.id as teacher_id,
            t.hourly_rate,
            t.bio
        FROM users u
        LEFT JOIN students s ON s.user_id = u.id
        LEFT JOIN teachers t ON t.user_id = u.id
        ORDER BY u.created_at DESC
        """
    )
    users = []
    for row in rows:
        users.append({
            "id": row["id"],
            "name": row["name"],
            "email": row["email"],
            "role": row["role"],
            "phone": row["phone_number"] or "",
            "created_at": str(row["created_at"]) if row["created_at"] else None,
            "student_id": row["student_id"],
            "teacher_id": row["teacher_id"],
            "hourly_rate": float(row["hourly_rate"]) if row["hourly_rate"] else None,
            "bio": row["bio"]
        })
    return {"users": users}
@router.get("/users/{user_id}")
async def get_user_by_id(user_id: int, user: dict = Depends(require_admin)):
    pool = await get_connection()
    row = await pool.fetchrow(
        """
        SELECT
            u.id,
            u.name,
            u.email,
            u.role,
            u.created_at,
            s.phone_number,
            s.id as student_id,
            t.id as teacher_id,
            t.hourly_rate,
            t.bio
        FROM users u
        LEFT JOIN students s ON s.user_id = u.id
        LEFT JOIN teachers t ON t.user_id = u.id
        WHERE u.id = $1
        """,
        user_id
    )
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "user": {
            "id": row["id"],
            "name": row["name"],
            "email": row["email"],
            "role": row["role"],
            "phone": row["phone_number"] or "",
            "created_at": str(row["created_at"]) if row["created_at"] else None,
            "student_id": row["student_id"],
            "teacher_id": row["teacher_id"],
            "hourly_rate": float(row["hourly_rate"]) if row["hourly_rate"] else None,
            "bio": row["bio"]
        }
    }
@router.put("/users/{user_id}")
async def update_user(user_id: int, data: UpdateUserRequest, user: dict = Depends(require_admin)):
    pool = await get_connection()
    existing = await pool.fetchrow("SELECT id, role FROM users WHERE id = $1", user_id)
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    if data.email:
        email_check = await pool.fetchrow(
            "SELECT id FROM users WHERE email = $1 AND id != $2",
            data.email, user_id
        )
        if email_check:
            raise HTTPException(status_code=400, detail="Email is already in use by another user")
    update_fields = []
    update_values = []
    param_idx = 1
    if data.name is not None:
        update_fields.append(f"name = ${param_idx}")
        update_values.append(data.name)
        param_idx += 1
    if data.email is not None:
        update_fields.append(f"email = ${param_idx}")
        update_values.append(data.email)
        param_idx += 1
    if data.role is not None:
        update_fields.append(f"role = ${param_idx}")
        update_values.append(data.role)
        param_idx += 1
    if update_fields:
        update_values.append(user_id)
        await pool.execute(
            f"UPDATE users SET {', '.join(update_fields)} WHERE id = ${param_idx}",
            *update_values
        )
    if data.role is not None and data.role != existing["role"]:
        if data.role == "student":
            existing_student = await pool.fetchrow("SELECT id FROM students WHERE user_id = $1", user_id)
            if not existing_student:
                await pool.execute(
                    "INSERT INTO students (user_id, phone_number) VALUES ($1, $2)",
                    user_id, data.phone or ""
                )
        elif data.role == "teacher":
            existing_teacher = await pool.fetchrow("SELECT id FROM teachers WHERE user_id = $1", user_id)
            if not existing_teacher:
                await pool.execute(
                    "INSERT INTO teachers (user_id) VALUES ($1)",
                    user_id
                )
    if data.phone is not None:
        student = await pool.fetchrow("SELECT id FROM students WHERE user_id = $1", user_id)
        if student:
            await pool.execute(
                "UPDATE students SET phone_number = $1 WHERE user_id = $2",
                data.phone, user_id
            )
        elif existing["role"] == "student" or data.role == "student":
            await pool.execute(
                """
                INSERT INTO students (user_id, phone_number)
                VALUES ($1, $2)
                ON CONFLICT (user_id) DO UPDATE SET phone_number = $2
                """,
                user_id, data.phone
            )
    return {"message": "User updated successfully"}
@router.delete("/users/{user_id}")
async def delete_user(user_id: int, user: dict = Depends(require_admin)):
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    pool = await get_connection()
    existing = await pool.fetchrow("SELECT id, role FROM users WHERE id = $1", user_id)
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    await pool.execute("DELETE FROM users WHERE id = $1", user_id)
    return {"message": "User deleted successfully"}
