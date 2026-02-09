from fastapi import APIRouter, Depends, HTTPException
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


@router.patch("/admin/settings")
async def admin_update_settings(data: UpdateSettingsRequest, user: dict = Depends(require_admin)):
    pool = await get_connection()

    updates = 0
    if data.registration_enabled is not None:
        await set_setting_value(pool, "registration.enabled", bool(data.registration_enabled))
        updates += 1
    if data.trial_lessons_enabled is not None:
        await set_setting_value(pool, "trial_lessons.enabled", bool(data.trial_lessons_enabled))
        updates += 1

    if updates == 0:
        raise HTTPException(status_code=400, detail="No settings provided")

    settings = await get_settings_values(pool, DEFAULT_SETTINGS.keys())
    return {"settings": settings}
