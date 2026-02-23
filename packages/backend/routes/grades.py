from datetime import date
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.database import get_connection
from app.auth import require_auth, require_teacher, require_student
from app.system_settings import get_bool_setting, get_str_setting, get_settings_values, set_setting_value
from app.audit_log import log_action

router = APIRouter(prefix="/grades", tags=["Grades"])


async def resolve_teacher_id(pool, user_id: int) -> Optional[int]:
    row = await pool.fetchrow("SELECT id FROM teachers WHERE user_id = $1", user_id)
    return row["id"] if row else None


async def resolve_student_id(pool, user_id: int) -> Optional[int]:
    row = await pool.fetchrow("SELECT id FROM students WHERE user_id = $1", user_id)
    return row["id"] if row else None


async def teacher_has_access_to_group(pool, teacher_id: int, group_id: int) -> bool:
    row = await pool.fetchrow(
        """
        SELECT 1
        FROM group_teachers
        WHERE group_id = $1 AND teacher_id = $2
        """,
        group_id,
        teacher_id,
    )
    return row is not None


async def get_grades_columns(pool):
    rows = await pool.fetch(
        """
        SELECT column_name, data_type, udt_name, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'grades'
        """
    )
    return {row["column_name"]: row for row in rows}


async def _convert_grades_scale(pool, from_scale: str, to_scale: str) -> None:
    if from_scale == to_scale:
        return

    factor = 1
    if from_scale == "0-5" and to_scale == "0-100":
        factor = 20
    elif from_scale == "0-100" and to_scale == "0-5":
        factor = 0.05
    else:
        return

    columns_by_name = await get_grades_columns(pool)
    if "value" in columns_by_name:
        await pool.execute(
            """
            UPDATE grades
            SET value = ROUND((value * $1::numeric), 2)
            WHERE value IS NOT NULL
            """,
            factor,
        )
    if "grade_value" in columns_by_name:
        await pool.execute(
            """
            UPDATE grades
            SET grade_value = ROUND((grade_value * $1::numeric), 2)
            WHERE grade_value IS NOT NULL
            """,
            factor,
        )


async def _ensure_grades_scale_applied(pool) -> None:
    settings = await get_settings_values(pool, ["grades.scale", "grades.scale_applied"])
    current_scale = settings.get("grades.scale", "0-5")
    applied_scale = settings.get("grades.scale_applied")

    if applied_scale is None:
        columns_by_name = await get_grades_columns(pool)
        value_expr = "value"
        if "grade_value" in columns_by_name:
            value_expr = "COALESCE(grade_value, value)"
        max_row = await pool.fetchrow(f"SELECT MAX({value_expr}) AS max_value FROM grades")
        max_value = max_row["max_value"] if max_row else None
        inferred_scale = "0-5"
        if max_value is not None and float(max_value) > 5.5:
            inferred_scale = "0-100"
        applied_scale = inferred_scale

        if applied_scale != current_scale:
            await _convert_grades_scale(pool, applied_scale, current_scale)
        await set_setting_value(pool, "grades.scale_applied", current_scale)
        return

    if applied_scale == current_scale:
        return

    await _convert_grades_scale(pool, applied_scale, current_scale)
    await set_setting_value(pool, "grades.scale_applied", current_scale)


async def _get_value_select_with_scale(pool, table_alias: str = "gr") -> str:
    settings = await get_settings_values(pool, ["grades.scale", "grades.scale_applied"])
    current_scale = settings.get("grades.scale", "0-5")
    applied_scale = settings.get("grades.scale_applied", current_scale)

    columns_by_name = await get_grades_columns(pool)
    base_expr = f"{table_alias}.value"
    if "grade_value" in columns_by_name:
        base_expr = f"COALESCE({table_alias}.value, {table_alias}.grade_value)"

    factor = 1
    if applied_scale == "0-5" and current_scale == "0-100":
        factor = 20
    elif applied_scale == "0-100" and current_scale == "0-5":
        factor = 0.05

    if factor == 1:
        return f"{base_expr} AS value"
    return f"ROUND(({base_expr} * {factor}::numeric), 2) AS value"



class UpsertGradeRequest(BaseModel):
    attendance_record_id: Optional[int] = None
    group_id: Optional[int] = None
    student_id: Optional[int] = None
    lesson_id: Optional[int] = None
    value: float = Field(..., ge=0)
    comment: Optional[str] = None
    grade_date: Optional[str] = None


class DeleteGradeRequest(BaseModel):
    attendance_record_id: Optional[int] = None
    group_id: Optional[int] = None
    student_id: Optional[int] = None
    lesson_id: Optional[int] = None


class GradeItem(BaseModel):
    id: int
    student_id: int
    student_name: Optional[str] = None
    group_id: int
    group_name: Optional[str] = None
    attendance_record_id: Optional[int] = None
    lesson_id: Optional[int] = None
    value: float
    comment: Optional[str] = None
    grade_date: Optional[str] = None
    recorded_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


@router.post("", response_model=dict)
async def upsert_grade(data: UpsertGradeRequest, user: dict = Depends(require_teacher)):
    pool = await get_connection()
    teacher_edit_enabled = await get_bool_setting(pool, "grades.teacher_edit_enabled", True)
    if not teacher_edit_enabled:
        raise HTTPException(status_code=403, detail="Редактирование оценок отключено")
    teacher_id = await resolve_teacher_id(pool, user["id"])
    if not teacher_id:
        raise HTTPException(status_code=404, detail="Teacher profile not found")

    group_id: Optional[int] = None
    student_id: Optional[int] = None
    lesson_id: Optional[int] = None
    attendance_record_id: Optional[int] = None

    if data.attendance_record_id is not None:
        ar = await pool.fetchrow(
            """
            SELECT
                ar.id,
                ar.group_id,
                ar.student_id,
                ar.lesson_id,
                ar.recorded_at
            FROM attendance_records ar
            WHERE ar.id = $1
            """,
            data.attendance_record_id,
        )
        if not ar:
            raise HTTPException(status_code=404, detail="Attendance record not found")

        attendance_record_id = int(ar["id"])
        group_id = int(ar["group_id"]) if ar["group_id"] is not None else None
        student_id = int(ar["student_id"]) if ar["student_id"] is not None else None
        lesson_id = int(ar["lesson_id"]) if ar["lesson_id"] is not None else None
    else:
        group_id = int(data.group_id) if data.group_id is not None else None
        student_id = int(data.student_id) if data.student_id is not None else None
        lesson_id = int(data.lesson_id) if data.lesson_id is not None else None

    if group_id is None or student_id is None or lesson_id is None:
        raise HTTPException(
            status_code=400,
            detail="Provide attendance_record_id or group_id+student_id+lesson_id",
        )

    if not await teacher_has_access_to_group(pool, teacher_id, group_id):
        raise HTTPException(status_code=403, detail="Access denied to this group")

    in_group = await pool.fetchval(
        """
        SELECT EXISTS(
            SELECT 1 FROM group_students WHERE group_id = $1 AND student_id = $2
        )
        """,
        group_id,
        student_id,
    )
    if not in_group:
        raise HTTPException(status_code=400, detail="Student is not enrolled in this group")

    grade_dt = None
    if data.grade_date:
        try:
            grade_dt = date.fromisoformat(data.grade_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="grade_date must be YYYY-MM-DD")
    else:
        grade_dt = date.today()

    grade_scale = await get_str_setting(pool, "grades.scale", "0-5")
    max_allowed = 5.0 if grade_scale == "0-5" else 100.0
    if data.value < 0 or data.value > max_allowed:
        max_label = f"{max_allowed:g}"
        raise HTTPException(status_code=400, detail=f"Оценка должна быть от 0 до {max_label}")

    columns_by_name = await get_grades_columns(pool)
    type_value = None
    type_column = columns_by_name.get("type")
    if type_column:
        default_raw = type_column["column_default"]
        if default_raw:
            match = re.search(r"'([^']+)'", str(default_raw))
            if match:
                type_value = match.group(1)
        if type_value is None and type_column["udt_name"]:
            enum_row = await pool.fetchrow(
                """
                SELECT enumlabel
                FROM pg_enum e
                JOIN pg_type t ON t.oid = e.enumtypid
                WHERE t.typname = $1
                ORDER BY e.enumsortorder
                LIMIT 1
                """,
                type_column["udt_name"],
            )
            if enum_row:
                type_value = enum_row["enumlabel"]
        if type_value is None and type_column["data_type"] in {"text", "character varying"}:
            type_value = "draft"

    columns = [
        "attendance_record_id",
        "student_id",
        "group_id",
        "lesson_id",
        "teacher_id",
        "comment",
        "grade_date",
    ]
    params = [
        attendance_record_id,
        student_id,
        group_id,
        lesson_id,
        teacher_id,
        data.comment,
        grade_dt,
    ]
    has_value = "value" in columns_by_name
    has_grade_value = "grade_value" in columns_by_name
    if not has_value and not has_grade_value:
        raise HTTPException(status_code=500, detail="Grades schema missing value column")
    if has_value:
        columns.append("value")
        params.append(data.value)
    if has_grade_value:
        columns.append("grade_value")
        params.append(data.value)
    if type_column and type_value is not None:
        columns.append("type")
        params.append(type_value)

    placeholders = ", ".join([f"${i}" for i in range(1, len(params) + 1)])
    update_assignments = [
        "attendance_record_id = COALESCE(EXCLUDED.attendance_record_id, grades.attendance_record_id)",
        "group_id = EXCLUDED.group_id",
        "teacher_id = EXCLUDED.teacher_id",
        "comment = EXCLUDED.comment",
        "grade_date = COALESCE(EXCLUDED.grade_date, grades.grade_date)",
        "deleted_at = NULL",
        "updated_at = NOW()",
    ]
    if has_value:
        update_assignments.insert(3, "value = EXCLUDED.value")
    if has_grade_value:
        update_assignments.insert(3, "grade_value = EXCLUDED.grade_value")

    sql = f"""
        INSERT INTO grades ({', '.join(columns)})
        VALUES ({placeholders})
        ON CONFLICT (student_id, lesson_id)
        DO UPDATE SET
            {', '.join(update_assignments)}
        RETURNING id
        """

    before_grade = None
    try:
        before_grade = await pool.fetchrow(
            """
            SELECT id, value, grade_value, comment, grade_date
            FROM grades
            WHERE student_id = $1 AND lesson_id = $2 AND deleted_at IS NULL
            """,
            student_id,
            lesson_id,
        )
    except Exception:
        before_grade = None

    row = await pool.fetchrow(sql, *params)

    try:
        group = await pool.fetchrow("SELECT id, name, duration_minutes FROM groups WHERE id = $1", group_id)
        group_name = group["name"] if group else str(group_id)

        student = await pool.fetchrow(
            """
            SELECT s.id AS student_id, u.name AS student_name, u.email AS student_email
            FROM students s
            JOIN users u ON u.id = s.user_id
            WHERE s.id = $1
            """,
            student_id,
        )
        student_name = student["student_name"] if student else str(student_id)
        student_email = student["student_email"] if student else None
        student_identity = f"{student_name}{(' <' + student_email + '>') if student_email else ''}"

        lesson = await pool.fetchrow(
            """
            SELECT id, start_time
            FROM lessons
            WHERE id = $1
            """,
            lesson_id,
        )
        lesson_start = lesson["start_time"] if lesson else None
        dt_label = grade_dt.isoformat() if grade_dt else date.today().isoformat()
        if lesson_start:
            try:
                dt_label = lesson_start.strftime("%Y-%m-%d %H:%M")
            except Exception:
                pass

        before_value = None
        if before_grade:
            before_value = before_grade.get("grade_value") if before_grade.get("grade_value") is not None else before_grade.get("value")
        after_value = float(data.value) if data.value is not None else None

        action_key = "teacher.grades.created" if not before_grade else "teacher.grades.updated"
        value_part = ""
        if before_grade and before_value != after_value:
            value_part = f": оценка: {before_value} → {after_value}"
        elif not before_grade:
            value_part = f": оценка: {after_value}"

        await log_action(
            actor=user,
            action_key=action_key,
            action_label=f"Изменение оценки: группа: {group_name}: {dt_label}: студент: {student_identity}" + value_part,
            meta={
                "group_id": group_id,
                "group_name": group_name,
                "student_id": student_id,
                "student_name": student_name,
                "student_email": student_email,
                "lesson_id": lesson_id,
                "lesson_start": lesson_start.isoformat() if lesson_start else None,
                "grade_date": grade_dt.isoformat() if grade_dt else None,
                "before": {
                    "value": before_value,
                    "comment": before_grade.get("comment") if before_grade else None,
                },
                "after": {
                    "value": after_value,
                    "comment": data.comment,
                },
            },
        )
    except Exception:
        pass

    return {"message": "Grade saved", "grade_id": row["id"]}


@router.delete("")
async def delete_grade(data: DeleteGradeRequest, user: dict = Depends(require_teacher)):
    pool = await get_connection()
    teacher_edit_enabled = await get_bool_setting(pool, "grades.teacher_edit_enabled", True)
    if not teacher_edit_enabled:
        raise HTTPException(status_code=403, detail="Редактирование оценок отключено")

    teacher_id = await resolve_teacher_id(pool, user["id"])
    if not teacher_id:
        raise HTTPException(status_code=404, detail="Teacher profile not found")

    group_id: Optional[int] = None
    student_id: Optional[int] = None
    lesson_id: Optional[int] = None
    attendance_record_id: Optional[int] = None

    if data.attendance_record_id is not None:
        ar = await pool.fetchrow(
            """
            SELECT ar.id, ar.group_id, ar.student_id, ar.lesson_id
            FROM attendance_records ar
            WHERE ar.id = $1
            """,
            data.attendance_record_id,
        )
        if not ar:
            raise HTTPException(status_code=404, detail="Attendance record not found")
        attendance_record_id = int(ar["id"])
        group_id = int(ar["group_id"]) if ar["group_id"] is not None else None
        student_id = int(ar["student_id"]) if ar["student_id"] is not None else None
        lesson_id = int(ar["lesson_id"]) if ar["lesson_id"] is not None else None
    else:
        group_id = int(data.group_id) if data.group_id is not None else None
        student_id = int(data.student_id) if data.student_id is not None else None
        lesson_id = int(data.lesson_id) if data.lesson_id is not None else None

    if group_id is None or student_id is None or lesson_id is None:
        raise HTTPException(
            status_code=400,
            detail="Provide attendance_record_id or group_id+student_id+lesson_id",
        )

    if not await teacher_has_access_to_group(pool, teacher_id, group_id):
        raise HTTPException(status_code=403, detail="Access denied to this group")

    before_grade = None
    try:
        before_grade = await pool.fetchrow(
            """
            SELECT id, value, grade_value, comment, grade_date
            FROM grades
            WHERE student_id = $1 AND lesson_id = $2 AND deleted_at IS NULL
            """,
            student_id,
            lesson_id,
        )
    except Exception:
        before_grade = None

    result = await pool.execute(
        """
        UPDATE grades
        SET deleted_at = NOW(), updated_at = NOW()
        WHERE group_id = $1 AND student_id = $2 AND lesson_id = $3
        """,
        group_id,
        student_id,
        lesson_id,
    )

    try:
        group = await pool.fetchrow("SELECT id, name FROM groups WHERE id = $1", group_id)
        group_name = group["name"] if group else str(group_id)

        student = await pool.fetchrow(
            """
            SELECT s.id AS student_id, u.name AS student_name, u.email AS student_email
            FROM students s
            JOIN users u ON u.id = s.user_id
            WHERE s.id = $1
            """,
            student_id,
        )
        student_name = student["student_name"] if student else str(student_id)
        student_email = student["student_email"] if student else None
        student_identity = f"{student_name}{(' <' + student_email + '>') if student_email else ''}"

        lesson = await pool.fetchrow("SELECT id, start_time FROM lessons WHERE id = $1", lesson_id)
        lesson_start = lesson["start_time"] if lesson else None
        dt_label = None
        if lesson_start:
            try:
                dt_label = lesson_start.strftime("%Y-%m-%d %H:%M")
            except Exception:
                dt_label = None

        before_value = None
        if before_grade:
            before_value = before_grade.get("grade_value") if before_grade.get("grade_value") is not None else before_grade.get("value")

        await log_action(
            actor=user,
            action_key="teacher.grades.deleted",
            action_label=f"Удаление оценки: группа: {group_name}: {(dt_label or '—')}: студент: {student_identity}: оценка: {before_value if before_value is not None else '—'}",
            meta={
                "group_id": group_id,
                "group_name": group_name,
                "student_id": student_id,
                "student_name": student_name,
                "student_email": student_email,
                "lesson_id": lesson_id,
                "lesson_start": lesson_start.isoformat() if lesson_start else None,
                "before": {
                    "value": before_value,
                    "comment": before_grade.get("comment") if before_grade else None,
                    "grade_date": before_grade.get("grade_date") if before_grade else None,
                },
            },
        )
    except Exception:
        pass

    return {"message": "Grade deleted", "result": result}


@router.get("/teacher/group/{group_id}")
async def list_group_grades_for_teacher(group_id: int, user: dict = Depends(require_teacher)):
    pool = await get_connection()
    await _ensure_grades_scale_applied(pool)
    value_select = await _get_value_select_with_scale(pool, "gr")
    teacher_id = await resolve_teacher_id(pool, user["id"])
    if not teacher_id:
        raise HTTPException(status_code=404, detail="Teacher profile not found")

    if not await teacher_has_access_to_group(pool, teacher_id, group_id):
        raise HTTPException(status_code=403, detail="Access denied to this group")

    rows = await pool.fetch(
        f"""
        SELECT
            gr.id,
            gr.student_id,
            u.name AS student_name,
            gr.group_id,
            g.name AS group_name,
            gr.attendance_record_id,
            gr.lesson_id,
            {value_select},
            gr.comment,
            gr.grade_date,
            ar.recorded_at,
            gr.created_at,
            gr.updated_at
        FROM grades gr
        JOIN students s ON s.id = gr.student_id
        JOIN users u ON u.id = s.user_id
        JOIN groups g ON g.id = gr.group_id
        LEFT JOIN attendance_records ar ON ar.id = gr.attendance_record_id
    WHERE gr.group_id = $1 AND gr.deleted_at IS NULL
        ORDER BY u.name, ar.recorded_at NULLS LAST, gr.grade_date NULLS LAST, gr.updated_at DESC
        """,
        group_id,
    )

    return {
        "grades": [
            {
                "id": r["id"],
                "student_id": r["student_id"],
                "student_name": r["student_name"],
                "group_id": r["group_id"],
                "group_name": r["group_name"],
                "attendance_record_id": r["attendance_record_id"],
                "lesson_id": r["lesson_id"],
                "value": float(r["value"]),
                "comment": r["comment"],
                "grade_date": str(r["grade_date"]) if r["grade_date"] else None,
                "recorded_at": str(r["recorded_at"]) if r["recorded_at"] else None,
                "created_at": str(r["created_at"]) if r["created_at"] else None,
                "updated_at": str(r["updated_at"]) if r["updated_at"] else None,
            }
            for r in rows
        ]
    }


@router.get("/student/me")
async def list_my_grades(user: dict = Depends(require_student)):
    pool = await get_connection()
    await _ensure_grades_scale_applied(pool)
    value_select = await _get_value_select_with_scale(pool, "gr")
    student_id = await resolve_student_id(pool, user["id"])
    if not student_id:
        raise HTTPException(status_code=404, detail="Student profile not found")

    rows = await pool.fetch(
        f"""
        SELECT
            gr.id,
            gr.student_id,
            gr.group_id,
            g.name AS group_name,
            gr.attendance_record_id,
            gr.lesson_id,
            {value_select},
            gr.comment,
            gr.grade_date,
            ar.recorded_at,
            gr.created_at,
            gr.updated_at,
            u_teacher.name AS teacher_name
        FROM grades gr
        JOIN groups g ON g.id = gr.group_id
        JOIN teachers t ON t.id = gr.teacher_id
        JOIN users u_teacher ON u_teacher.id = t.user_id
        LEFT JOIN attendance_records ar ON ar.id = gr.attendance_record_id
    WHERE gr.student_id = $1 AND gr.deleted_at IS NULL
        ORDER BY ar.recorded_at NULLS LAST, gr.grade_date NULLS LAST, gr.updated_at DESC
        """,
        student_id,
    )

    return {
        "grades": [
            {
                "id": r["id"],
                "student_id": r["student_id"],
                "group_id": r["group_id"],
                "group_name": r["group_name"],
                "attendance_record_id": r["attendance_record_id"],
                "lesson_id": r["lesson_id"],
                "value": float(r["value"]),
                "comment": r["comment"],
                "grade_date": str(r["grade_date"]) if r["grade_date"] else None,
                "recorded_at": str(r["recorded_at"]) if r["recorded_at"] else None,
                "created_at": str(r["created_at"]) if r["created_at"] else None,
                "updated_at": str(r["updated_at"]) if r["updated_at"] else None,
                "teacher_name": r["teacher_name"],
            }
            for r in rows
        ]
    }


@router.get("/admin/group/{group_id}")
async def list_group_grades_for_admin(group_id: int, user: dict = Depends(require_auth)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")

    pool = await get_connection()
    await _ensure_grades_scale_applied(pool)
    value_select = await _get_value_select_with_scale(pool, "gr")
    rows = await pool.fetch(
        f"""
        SELECT
            gr.id,
            gr.student_id,
            u_student.name AS student_name,
            gr.group_id,
            g.name AS group_name,
            gr.attendance_record_id,
            gr.lesson_id,
            {value_select},
            gr.comment,
            gr.grade_date,
            ar.recorded_at,
            gr.updated_at,
            u_teacher.name AS teacher_name
        FROM grades gr
        JOIN students s ON s.id = gr.student_id
        JOIN users u_student ON u_student.id = s.user_id
        JOIN groups g ON g.id = gr.group_id
        JOIN teachers t ON t.id = gr.teacher_id
        JOIN users u_teacher ON u_teacher.id = t.user_id
        LEFT JOIN attendance_records ar ON ar.id = gr.attendance_record_id
    WHERE gr.group_id = $1 AND gr.deleted_at IS NULL
        ORDER BY u_student.name, ar.recorded_at NULLS LAST, gr.grade_date NULLS LAST, gr.updated_at DESC
        """,
        group_id,
    )

    return {
        "grades": [
            {
                "id": r["id"],
                "student_id": r["student_id"],
                "student_name": r["student_name"],
                "group_id": r["group_id"],
                "group_name": r["group_name"],
                "attendance_record_id": r["attendance_record_id"],
                "lesson_id": r["lesson_id"],
                "value": float(r["value"]),
                "comment": r["comment"],
                "grade_date": str(r["grade_date"]) if r["grade_date"] else None,
                "recorded_at": str(r["recorded_at"]) if r["recorded_at"] else None,
                "updated_at": str(r["updated_at"]) if r["updated_at"] else None,
                "teacher_name": r["teacher_name"],
            }
            for r in rows
        ]
    }
