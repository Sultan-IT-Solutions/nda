from __future__ import annotations

import json

from typing import Any, Optional, Dict

from fastapi import Request

from app.database import get_connection, ensure_audit_logs_schema


async def log_action(
    *,
    actor: Optional[dict],
    action_key: str,
    action_label: str,
    meta: Optional[Dict[str, Any]] = None,
    request: Optional[Request] = None,
) -> None:
    
    pool = await get_connection()
    await ensure_audit_logs_schema(pool)

    actor_user_id = None
    actor_role = None
    actor_name = None
    actor_email = None

    if actor:
        try:
            actor_user_id = actor.get("id") or actor.get("sub")
            actor_role = actor.get("role")
            actor_name = actor.get("name")
            actor_email = actor.get("email")
        except Exception:
            pass

    ip = None
    ua = None
    if request is not None:
        ip = request.client.host if request.client else None
        ua = request.headers.get("user-agent")

    meta_json_text: str | None = None
    if meta is not None:
        try:
            meta_json_text = json.dumps(meta, ensure_ascii=False, default=str)
        except Exception:
            meta_json_text = json.dumps({"_meta_unserializable": True}, ensure_ascii=False)

    async with pool.acquire() as conn:
        if actor_user_id is not None and (not actor_name or not actor_email):
            try:
                row = await conn.fetchrow(
                    "SELECT name, email FROM users WHERE id = $1",
                    int(actor_user_id),
                )
                if row:
                    actor_name = actor_name or row.get("name")
                    actor_email = actor_email or row.get("email")
            except Exception:
                pass

        await conn.execute(
            """
            INSERT INTO audit_logs (
                actor_user_id,
                actor_role,
                actor_name,
                actor_email,
                action_key,
                action_label,
                meta_json,
                ip,
                user_agent
            ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)
            """,
            actor_user_id,
            actor_role,
            actor_name,
            actor_email,
            action_key,
            action_label,
            meta_json_text,
            ip,
            ua,
        )
