import asyncpg
import json
from typing import Any, Dict, Iterable

from app.database import ensure_system_settings_schema


DEFAULT_SETTINGS: Dict[str, Any] = {
    "registration.enabled": True,
    "trial_lessons.enabled": True,
    "grades.scale": "0-5",
    "grades.teacher_edit_enabled": True,
    "school.electives.enabled": True,
    "school.class.require_teacher": False,
    "school.class.require_hall": False,
    "school.class.allow_multi_teachers": True,
    "transcript.enabled": True,
    "transcript.require_complete": True,
    "transcript.exclude_cancelled": True,
}

PUBLIC_SETTINGS_KEYS = tuple(DEFAULT_SETTINGS.keys())


async def get_settings_values(
    pool: asyncpg.Pool,
    keys: Iterable[str],
) -> Dict[str, Any]:
    await ensure_system_settings_schema(pool)
    keys_list = [str(k) for k in keys]
    if not keys_list:
        return {}

    rows = await pool.fetch(
        "SELECT key, value_json FROM system_settings WHERE key = ANY($1::text[])",
        keys_list,
    )

    out: Dict[str, Any] = {}
    for row in rows:
        key = row["key"]
        raw = row["value_json"]
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except Exception:
                pass
        out[key] = raw

    for key in keys_list:
        if key not in out:
            out[key] = DEFAULT_SETTINGS.get(key)

    return out


async def get_bool_setting(pool: asyncpg.Pool, key: str, default: bool = True) -> bool:
    values = await get_settings_values(pool, [key])
    raw = values.get(key, default)
    if isinstance(raw, bool):
        return raw
    if raw is None:
        return default
    if isinstance(raw, (int, float)):
        return bool(raw)
    if isinstance(raw, str):
        lowered = raw.strip().lower()
        if lowered in {"1", "true", "yes", "y", "on"}:
            return True
        if lowered in {"0", "false", "no", "n", "off"}:
            return False
    return default


async def get_str_setting(pool: asyncpg.Pool, key: str, default: str = "") -> str:
    values = await get_settings_values(pool, [key])
    raw = values.get(key, default)
    if raw is None:
        return default
    return str(raw)


async def set_setting_value(pool: asyncpg.Pool, key: str, value: Any) -> None:
    await ensure_system_settings_schema(pool)
    payload = json.dumps(value)
    await pool.execute(
        """
        INSERT INTO system_settings (key, value_json)
        VALUES ($1, $2)
        ON CONFLICT (key) DO UPDATE
        SET value_json = EXCLUDED.value_json, updated_at = NOW()
        """,
        str(key),
        payload,
    )


async def get_public_settings(pool: asyncpg.Pool) -> Dict[str, Any]:
    return await get_settings_values(pool, PUBLIC_SETTINGS_KEYS)
