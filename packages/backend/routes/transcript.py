from typing import Any, Dict, List, Optional
import json

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from app.auth import require_admin, require_student
from app.database import get_connection
from app.system_settings import get_bool_setting
from app.audit_log import log_action
from routes.grades import _ensure_grades_scale_applied, _get_value_select_with_scale

router = APIRouter(tags=["Transcript"])


class PublishTranscriptRequest(BaseModel):
    subject_id: Optional[int] = None


async def _get_total_lessons(pool, group_id: int, exclude_cancelled: bool) -> int:
    if exclude_cancelled:
        total = await pool.fetchval(
            "SELECT COUNT(*) FROM lessons WHERE group_id = $1 AND COALESCE(is_cancelled, FALSE) = FALSE",
            group_id,
        )
    else:
        total = await pool.fetchval(
            "SELECT COUNT(*) FROM lessons WHERE group_id = $1",
            group_id,
        )
    return int(total or 0)


async def _get_group_subjects(pool, group_id: int) -> List[Dict[str, Any]]:
    rows = await pool.fetch(
        """
        SELECT cs.subject_id, c.name, c.color
        FROM class_subjects cs
        JOIN subjects c ON c.id = cs.subject_id
        WHERE cs.group_id = $1
        ORDER BY c.name
        """,
        group_id,
    )
    subjects = [
        {
            "subject_id": int(r["subject_id"]),
            "subject_name": r["name"],
            "subject_color": r["color"],
        }
        for r in rows
    ]
    return subjects


async def _get_missing_students(pool, group_id: int, exclude_cancelled: bool) -> Dict[str, Any]:
    total_lessons = await _get_total_lessons(pool, group_id, exclude_cancelled)
    if exclude_cancelled:
        rows = await pool.fetch(
            """
            SELECT
                s.id AS student_id,
                u.name AS student_name,
                COUNT(DISTINCT gr.lesson_id) AS graded_lessons
            FROM group_students gs
            JOIN students s ON s.id = gs.student_id
            JOIN users u ON u.id = s.user_id
            LEFT JOIN grades gr ON gr.student_id = s.id
                AND gr.group_id = gs.group_id
                AND gr.deleted_at IS NULL
            LEFT JOIN lessons l ON l.id = gr.lesson_id
            WHERE gs.group_id = $1
              AND (gr.lesson_id IS NULL OR COALESCE(l.is_cancelled, FALSE) = FALSE)
            GROUP BY s.id, u.name
            ORDER BY u.name
            """,
            group_id,
        )
    else:
        rows = await pool.fetch(
            """
            SELECT
                s.id AS student_id,
                u.name AS student_name,
                COUNT(DISTINCT gr.lesson_id) AS graded_lessons
            FROM group_students gs
            JOIN students s ON s.id = gs.student_id
            JOIN users u ON u.id = s.user_id
            LEFT JOIN grades gr ON gr.student_id = s.id
                AND gr.group_id = gs.group_id
                AND gr.deleted_at IS NULL
            WHERE gs.group_id = $1
            GROUP BY s.id, u.name
            ORDER BY u.name
            """,
            group_id,
        )
    missing = []
    missing_lessons_total = 0
    for row in rows:
        graded_lessons = int(row["graded_lessons"] or 0)
        if total_lessons > 0 and graded_lessons < total_lessons:
            missing_lessons = max(total_lessons - graded_lessons, 0)
            missing.append({
                "id": int(row["student_id"]),
                "name": row["student_name"],
                "missing_lessons": missing_lessons,
            })
            missing_lessons_total += missing_lessons
    total_students = len(rows)
    return {
        "total_lessons": total_lessons,
        "total_students": total_students,
        "missing_lessons_total": missing_lessons_total,
        "missing_students": missing,
    }


async def _fetch_publication_history(pool, group_id: int, subject_id: Optional[int]) -> List[Dict[str, Any]]:
    if subject_id is None:
        rows = await pool.fetch(
            """
            SELECT
                tp.id,
                tp.subject_id,
                COALESCE(tp.subject_name, c.name) AS subject_name,
                tp.total_students,
                tp.total_lessons,
                tp.published_at,
                u.name AS actor_name
            FROM transcript_publications tp
            LEFT JOIN subjects c ON c.id = tp.subject_id
            LEFT JOIN users u ON u.id = tp.published_by
            WHERE tp.group_id = $1
            ORDER BY tp.published_at DESC
            LIMIT 20
            """,
            group_id,
        )
    else:
        rows = await pool.fetch(
            """
            SELECT
                tp.id,
                tp.subject_id,
                COALESCE(tp.subject_name, c.name) AS subject_name,
                tp.total_students,
                tp.total_lessons,
                tp.published_at,
                u.name AS actor_name
            FROM transcript_publications tp
            LEFT JOIN subjects c ON c.id = tp.subject_id
            LEFT JOIN users u ON u.id = tp.published_by
            WHERE tp.group_id = $1 AND tp.subject_id = $2
            ORDER BY tp.published_at DESC
            LIMIT 20
            """,
            group_id,
            subject_id,
        )
    return [
        {
            "id": r["id"],
            "subject_id": r["subject_id"],
            "subject_name": r["subject_name"],
            "total_students": int(r["total_students"] or 0),
            "total_lessons": int(r["total_lessons"] or 0),
            "published_at": _serialize_dt(r["published_at"]),
            "actor_name": r["actor_name"],
        }
        for r in rows
    ]


def _serialize_dt(value):
    if value is None:
        return None
    try:
        return value.isoformat()
    except Exception:
        return str(value)


@router.get("/admin/transcript/group/{group_id}")
async def get_group_transcript(
    group_id: int,
    subject_id: Optional[int] = Query(None),
    user: dict = Depends(require_admin),
):
    pool = await get_connection()
    enabled = await get_bool_setting(pool, "transcript.enabled", True)
    if not enabled:
        raise HTTPException(status_code=403, detail="Транскрипт отключен в настройках")
    exclude_cancelled = await get_bool_setting(pool, "transcript.exclude_cancelled", True)

    subjects = await _get_group_subjects(pool, group_id)
    subject_ids = {s["subject_id"] for s in subjects}

    selected_subject_id = subject_id
    if selected_subject_id is None and len(subjects) == 1:
        selected_subject_id = subjects[0]["subject_id"]

    missing_payload = await _get_missing_students(pool, group_id, exclude_cancelled)
    missing_students = missing_payload["missing_students"]
    total_lessons = missing_payload["total_lessons"]
    total_students = missing_payload["total_students"]
    missing_lessons_total = missing_payload["missing_lessons_total"]
    require_complete = await get_bool_setting(pool, "transcript.require_complete", True)
    can_publish = total_lessons > 0 and ((not require_complete) or len(missing_students) == 0)

    records: List[Dict[str, Any]] = []
    if selected_subject_id is not None and (not subject_ids or selected_subject_id in subject_ids):
        rows = await pool.fetch(
            """
            SELECT
                tr.id,
                tr.student_id,
                u.name AS student_name,
                tr.average_value,
                tr.grade_count,
                tr.grades_json,
                tr.published_at,
                tr.updated_at,
                COALESCE(tr.group_name, g.name) AS group_name,
                COALESCE(tr.subject_name, c.name) AS subject_name,
                COALESCE(tr.subject_color, c.color) AS subject_color
            FROM transcript_records tr
            JOIN students s ON s.id = tr.student_id
            JOIN users u ON u.id = s.user_id
            LEFT JOIN groups g ON g.id = tr.group_id
            LEFT JOIN subjects c ON c.id = tr.subject_id
            WHERE tr.group_id = $1 AND tr.subject_id = $2
            ORDER BY u.name
            """,
            group_id,
            selected_subject_id,
        )
        records = [
            {
                "id": r["id"],
                "student_id": r["student_id"],
                "student_name": r["student_name"],
                "average_value": float(r["average_value"]),
                "grade_count": int(r["grade_count"]),
                "grades": r["grades_json"] or [],
                "published_at": _serialize_dt(r["published_at"]),
                "updated_at": _serialize_dt(r["updated_at"]),
                "group_name": r["group_name"],
                "subject_name": r["subject_name"],
                "subject_color": r["subject_color"],
            }
            for r in rows
        ]

    return {
        "subjects": subjects,
        "subject_id": selected_subject_id,
        "records": records,
        "status": {
            "can_publish": can_publish,
            "missing_students": missing_students,
            "total_lessons": total_lessons,
            "total_students": total_students,
            "missing_lessons_total": missing_lessons_total,
            "require_complete": require_complete,
        },
        "history": await _fetch_publication_history(pool, group_id, selected_subject_id),
    }


async def _publish_subject(
    pool,
    group_id: int,
    subject_id: int,
    subject_meta: Dict[str, Any],
    group_name: str,
    user: dict,
    request: Request,
    require_complete: bool,
    exclude_cancelled: bool,
):
    await _ensure_grades_scale_applied(pool)
    value_select = await _get_value_select_with_scale(pool, "gr")

    missing_payload = await _get_missing_students(pool, group_id, exclude_cancelled)
    missing_students = missing_payload["missing_students"]
    total_lessons = missing_payload["total_lessons"]
    total_students = missing_payload["total_students"]

    if total_lessons == 0:
        raise HTTPException(
            status_code=400,
            detail="В классе нет уроков. Публикация недоступна.",
        )
    if require_complete and missing_students:
        raise HTTPException(
            status_code=400,
            detail="Не у всех учеников есть оценки. Публикация недоступна.",
        )

    rows = await pool.fetch(
        f"""
        SELECT
            gr.student_id,
            u_student.name AS student_name,
            gr.lesson_id,
            {value_select},
            gr.comment,
            gr.grade_date,
            ar.recorded_at,
            l.start_time AS lesson_start,
            u_teacher.name AS teacher_name
        FROM grades gr
        JOIN students s ON s.id = gr.student_id
        JOIN users u_student ON u_student.id = s.user_id
        JOIN teachers t ON t.id = gr.teacher_id
        JOIN users u_teacher ON u_teacher.id = t.user_id
        LEFT JOIN attendance_records ar ON ar.id = gr.attendance_record_id
        LEFT JOIN lessons l ON l.id = gr.lesson_id
        WHERE gr.group_id = $1 AND gr.deleted_at IS NULL
        ORDER BY u_student.name, l.start_time NULLS LAST, gr.grade_date NULLS LAST, gr.updated_at DESC
        """,
        group_id,
    )

    by_student: Dict[int, Dict[str, Any]] = {}
    for row in rows:
        student_id = int(row["student_id"])
        entry = by_student.get(student_id)
        if entry is None:
            entry = {
                "student_id": student_id,
                "student_name": row["student_name"],
                "grades": [],
            }
            by_student[student_id] = entry
        value_raw = row["value"]
        if value_raw is None:
            continue
        entry["grades"].append(
            {
                "lesson_id": row["lesson_id"],
                "value": float(value_raw),
                "comment": row["comment"],
                "grade_date": _serialize_dt(row["grade_date"]),
                "recorded_at": _serialize_dt(row["recorded_at"]),
                "lesson_start": _serialize_dt(row["lesson_start"]),
                "teacher_name": row["teacher_name"],
            }
        )

    records: List[Dict[str, Any]] = []
    for student_id, entry in by_student.items():
        grades = entry["grades"]
        if not grades:
            continue
        values = [g["value"] for g in grades if isinstance(g.get("value"), (int, float))]
        if not values:
            continue
        average_value = round(sum(values) / len(values), 2)
        grade_count = len(values)
        await pool.execute(
            """
            INSERT INTO transcript_records (
                student_id,
                group_id,
                group_name,
                subject_id,
                subject_name,
                subject_color,
                average_value,
                grade_count,
                grades_json,
                published_by,
                published_at,
                updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
            ON CONFLICT (student_id, group_id, subject_id)
            DO UPDATE SET
                group_name = EXCLUDED.group_name,
                subject_name = EXCLUDED.subject_name,
                subject_color = EXCLUDED.subject_color,
                average_value = EXCLUDED.average_value,
                grade_count = EXCLUDED.grade_count,
                grades_json = EXCLUDED.grades_json,
                published_by = EXCLUDED.published_by,
                published_at = NOW(),
                updated_at = NOW()
            """,
            student_id,
            group_id,
            group_name,
            subject_id,
            subject_meta.get("subject_name"),
            subject_meta.get("subject_color"),
            average_value,
            grade_count,
            json.dumps(grades, ensure_ascii=False),
            user.get("id"),
        )
        records.append(
            {
                "student_id": student_id,
                "student_name": entry["student_name"],
                "average_value": average_value,
                "grade_count": grade_count,
                "grades": grades,
            }
        )

    await pool.execute(
        """
        INSERT INTO transcript_publications (
            group_id,
            group_name,
            subject_id,
            subject_name,
            subject_color,
            published_by,
            total_students,
            total_lessons
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        """,
        group_id,
        group_name,
        subject_id,
        subject_meta.get("subject_name"),
        subject_meta.get("subject_color"),
        user.get("id"),
        total_students,
        total_lessons,
    )

    await log_action(
        actor=user,
        action_key="admin.transcript.published",
        action_label="Публикация оценок в транскрипт",
        meta={
            "group_id": group_id,
            "subject_id": subject_id,
            "subject_name": subject_meta.get("subject_name"),
            "student_count": len(records),
            "missing_students": len(missing_students),
            "total_lessons": total_lessons,
        },
        request=request,
    )

    return {
        "subject": subject_meta,
        "records": records,
    }


@router.post("/admin/transcript/group/{group_id}/publish")
async def publish_group_transcript(
    group_id: int,
    data: PublishTranscriptRequest,
    request: Request,
    user: dict = Depends(require_admin),
):
    pool = await get_connection()
    enabled = await get_bool_setting(pool, "transcript.enabled", True)
    if not enabled:
        raise HTTPException(status_code=403, detail="Транскрипт отключен в настройках")
    require_complete = await get_bool_setting(pool, "transcript.require_complete", True)
    exclude_cancelled = await get_bool_setting(pool, "transcript.exclude_cancelled", True)

    group = await pool.fetchrow("SELECT id, name FROM groups WHERE id = $1", group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Class not found")

    subjects = await _get_group_subjects(pool, group_id)
    if not subjects:
        raise HTTPException(status_code=400, detail="Для класса не указан предмет")

    subject_id = data.subject_id
    if subject_id is None and len(subjects) == 1:
        subject_id = subjects[0]["subject_id"]
    if subject_id is None:
        raise HTTPException(status_code=400, detail="Выберите предмет для публикации")

    subject_lookup = {s["subject_id"]: s for s in subjects}
    subject_meta = subject_lookup.get(subject_id)
    if subject_meta is None:
        raise HTTPException(status_code=400, detail="Предмет не относится к этому классу")

    missing_payload = await _get_missing_students(pool, group_id, exclude_cancelled)
    missing_students = missing_payload["missing_students"]
    total_lessons = missing_payload["total_lessons"]
    if total_lessons == 0:
        raise HTTPException(
            status_code=400,
            detail="В классе нет уроков. Публикация недоступна.",
        )
    if missing_students:
        raise HTTPException(
            status_code=400,
            detail="Не у всех учеников есть оценки. Публикация недоступна.",
        )

    return await _publish_subject(
        pool=pool,
        group_id=group_id,
        subject_id=subject_id,
        subject_meta=subject_meta,
        group_name=group["name"],
        user=user,
        request=request,
        require_complete=require_complete,
        exclude_cancelled=exclude_cancelled,
    )


@router.post("/admin/transcript/group/{group_id}/publish-all")
async def publish_group_transcript_all(
    group_id: int,
    request: Request,
    user: dict = Depends(require_admin),
):
    pool = await get_connection()
    enabled = await get_bool_setting(pool, "transcript.enabled", True)
    if not enabled:
        raise HTTPException(status_code=403, detail="Транскрипт отключен в настройках")
    require_complete = await get_bool_setting(pool, "transcript.require_complete", True)
    exclude_cancelled = await get_bool_setting(pool, "transcript.exclude_cancelled", True)

    group = await pool.fetchrow("SELECT id, name FROM groups WHERE id = $1", group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Class not found")

    subjects = await _get_group_subjects(pool, group_id)
    if not subjects:
        raise HTTPException(status_code=400, detail="Для класса не указан предмет")

    results = []
    for subject in subjects:
        result = await _publish_subject(
            pool=pool,
            group_id=group_id,
            subject_id=subject["subject_id"],
            subject_meta=subject,
            group_name=group["name"],
            user=user,
            request=request,
            require_complete=require_complete,
            exclude_cancelled=exclude_cancelled,
        )
        results.append(result)

    await log_action(
        actor=user,
        action_key="admin.transcript.publishedAll",
        action_label="Публикация транскрипта по всем предметам",
        meta={
            "group_id": group_id,
            "group_name": group["name"],
            "subjects_count": len(subjects),
        },
        request=request,
    )

    return {"subjects": subjects, "results": results}


@router.get("/transcript/me")
async def get_my_transcript(user: dict = Depends(require_student)):
    pool = await get_connection()
    enabled = await get_bool_setting(pool, "transcript.enabled", True)
    if not enabled:
        raise HTTPException(status_code=403, detail="Транскрипт отключен в настройках")

    student_id_row = await pool.fetchrow(
        "SELECT id FROM students WHERE user_id = $1", user["id"]
    )
    if not student_id_row:
        raise HTTPException(status_code=404, detail="Student profile not found")

    student_id = int(student_id_row["id"])

    rows = await pool.fetch(
        """
        SELECT
            tr.id,
            tr.group_id,
            COALESCE(tr.group_name, g.name) AS group_name,
            tr.subject_id,
            COALESCE(tr.subject_name, c.name) AS subject_name,
            COALESCE(tr.subject_color, c.color) AS subject_color,
            tr.average_value,
            tr.grade_count,
            tr.grades_json,
            tr.published_at,
            tr.updated_at
        FROM transcript_records tr
        LEFT JOIN groups g ON g.id = tr.group_id
        LEFT JOIN subjects c ON c.id = tr.subject_id
        WHERE tr.student_id = $1
        ORDER BY tr.published_at DESC
        """,
        student_id,
    )

    items = []
    for r in rows:
        grades_payload = r["grades_json"] or []
        if isinstance(grades_payload, str):
            try:
                grades_payload = json.loads(grades_payload)
            except Exception:
                grades_payload = []
        items.append(
            {
                "id": r["id"],
                "group_id": r["group_id"],
                "group_name": r["group_name"],
                "subject_id": r["subject_id"],
                "subject_name": r["subject_name"],
                "subject_color": r["subject_color"],
                "average_value": float(r["average_value"]),
                "grade_count": int(r["grade_count"]),
                "grades": grades_payload,
                "published_at": _serialize_dt(r["published_at"]),
                "updated_at": _serialize_dt(r["updated_at"]),
            }
        )

    return {"items": items}
