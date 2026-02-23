from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional

from app.auth import require_admin
from app.database import get_connection
from app.system_settings import (
    DEFAULT_SETTINGS,
    get_public_settings,
    get_settings_values,
    set_setting_value,
)
from app.notifications import NotificationType, create_notifications_for_users
from app.audit_log import log_action


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

    columns = await pool.fetch(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'grades'
        """
    )
    column_names = {row["column_name"] for row in columns}

    max_allowed = 5 if to_scale == "0-5" else 100
    if "value" in column_names:
        await pool.execute(
            """
            UPDATE grades
            SET value = LEAST(GREATEST(ROUND((value * $1::numeric), 2), 0), $2)
            WHERE value IS NOT NULL
            """,
            factor,
            max_allowed,
        )
    if "grade_value" in column_names:
        await pool.execute(
            """
            UPDATE grades
            SET grade_value = LEAST(GREATEST(ROUND((grade_value * $1::numeric), 2), 0), $2)
            WHERE grade_value IS NOT NULL
            """,
            factor,
            max_allowed,
        )


async def _notify_teachers_about_scale(pool, from_scale: str, to_scale: str) -> None:
    teachers = await pool.fetch(
        """
        SELECT DISTINCT u.id
        FROM teachers t
        JOIN users u ON u.id = t.user_id
        WHERE u.role = 'teacher'
        """
    )
    teacher_ids = [row["id"] for row in teachers]
    if not teacher_ids:
        return
    title = "Изменена шкала оценок"
    message = f"Шкала оценок изменена с {from_scale} на {to_scale}. Все выставленные оценки были пересчитаны автоматически."
    await create_notifications_for_users(
        user_ids=teacher_ids,
        notification_type=NotificationType.SYSTEM,
        title=title,
        message=message,
    )

router = APIRouter(tags=["Settings"])


@router.get("/settings/public")
async def settings_public():
    pool = await get_connection()
    settings = await get_public_settings(pool)
    return {"settings": settings}


@router.get("/admin/settings")
async def admin_settings(user: dict = Depends(require_admin)):
    pool = await get_connection()
    settings = await get_settings_values(pool, DEFAULT_SETTINGS.keys())
    return {"settings": settings}


class UpdateSettingsRequest(BaseModel):
    registration_enabled: Optional[bool] = None
    trial_lessons_enabled: Optional[bool] = None
    grades_scale: Optional[str] = None
    teacher_edit_enabled: Optional[bool] = None


@router.patch("/admin/settings")
async def admin_update_settings(
    data: UpdateSettingsRequest,
    request: Request,
    user: dict = Depends(require_admin),
):
    pool = await get_connection()

    before_settings = await get_settings_values(
        pool,
        [
            "registration.enabled",
            "trial_lessons.enabled",
            "grades.scale",
            "grades.teacher_edit_enabled",
        ],
    )

    current_scale = before_settings.get("grades.scale", "0-5")
    next_scale = current_scale

    updates = 0
    if data.registration_enabled is not None:
        await set_setting_value(pool, "registration.enabled", bool(data.registration_enabled))
        updates += 1
    if data.trial_lessons_enabled is not None:
        await set_setting_value(pool, "trial_lessons.enabled", bool(data.trial_lessons_enabled))
        updates += 1
    if data.grades_scale is not None:
        scale_value = str(data.grades_scale).strip()
        if scale_value not in {"0-5", "0-100"}:
            raise HTTPException(status_code=400, detail="Invalid grades scale")
        next_scale = scale_value
        if current_scale != next_scale:
            await _convert_grades_scale(pool, current_scale, next_scale)
            await _notify_teachers_about_scale(pool, current_scale, next_scale)
            await set_setting_value(pool, "grades.scale_applied", next_scale)
        await set_setting_value(pool, "grades.scale", scale_value)
        updates += 1
    if data.teacher_edit_enabled is not None:
        await set_setting_value(pool, "grades.teacher_edit_enabled", bool(data.teacher_edit_enabled))
        updates += 1

    if updates == 0:
        raise HTTPException(status_code=400, detail="Настройки не были изменены")

    if current_scale != next_scale and data.grades_scale is None:
        await _convert_grades_scale(pool, current_scale, next_scale)
        await _notify_teachers_about_scale(pool, current_scale, next_scale)

    settings = await get_settings_values(pool, DEFAULT_SETTINGS.keys())

    def _toggle_label(prefix: str, enabled: bool) -> str:
        return f"{prefix} / {'Включение' if enabled else 'Отключение'}"

    if data.registration_enabled is not None:
        enabled = bool(data.registration_enabled)
        await log_action(
            actor=user,
            action_key=f"admin.settings.registration{'Enabled' if enabled else 'Disabled'}",
            action_label=_toggle_label("Изменение системных настроек: Регистрация", enabled),
            meta={
                "setting": "registration.enabled",
                "from": before_settings.get("registration.enabled"),
                "to": enabled,
            },
            request=request,
        )

    if data.trial_lessons_enabled is not None:
        enabled = bool(data.trial_lessons_enabled)
        await log_action(
            actor=user,
            action_key=f"admin.settings.trialLessons{'Enabled' if enabled else 'Disabled'}",
            action_label=_toggle_label("Изменение системных настроек: Пробные уроки", enabled),
            meta={
                "setting": "trial_lessons.enabled",
                "from": before_settings.get("trial_lessons.enabled"),
                "to": enabled,
            },
            request=request,
        )

    if data.teacher_edit_enabled is not None:
        enabled = bool(data.teacher_edit_enabled)
        await log_action(
            actor=user,
            action_key=f"admin.settings.teacherEdit{'Enabled' if enabled else 'Disabled'}",
            action_label=_toggle_label(
                "Изменение системных настроек: Редактирование оценок учителем",
                enabled,
            ),
            meta={
                "setting": "grades.teacher_edit_enabled",
                "from": before_settings.get("grades.teacher_edit_enabled"),
                "to": enabled,
            },
            request=request,
        )

    if data.grades_scale is not None:
        await log_action(
            actor=user,
            action_key="admin.settings.gradesScale",
            action_label=f"Изменение системных настроек: Шкала оценок: {current_scale} → {next_scale}",
            meta={
                "setting": "grades.scale",
                "from": current_scale,
                "to": next_scale,
            },
            request=request,
        )

    return {"settings": settings}
