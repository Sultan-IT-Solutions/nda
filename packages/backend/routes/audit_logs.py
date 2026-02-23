from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.auth import require_admin
from app.database import get_connection, ensure_audit_logs_schema

router = APIRouter(tags=["AuditLogs"])


@router.get("/admin/audit-logs")
async def list_audit_logs(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    actor: Optional[str] = None,
    role: Optional[str] = None,
    action: Optional[str] = None,
    from_dt: Optional[datetime] = Query(None, alias="from"),
    to_dt: Optional[datetime] = Query(None, alias="to"),
    user: dict = Depends(require_admin),
):
    pool = await get_connection()
    await ensure_audit_logs_schema(pool)

    where = []
    params = []

    def add(cond: str, value):
        where.append(cond)
        params.append(value)

    if actor:
        add("(actor_name ILIKE $%d OR actor_email ILIKE $%d)" % (len(params) + 1, len(params) + 1), f"%{actor}%")
    if role:
        add("actor_role = $%d" % (len(params) + 1), role)
    if action:
        add("action_key ILIKE $%d" % (len(params) + 1), f"%{action}%")
    if from_dt:
        add("created_at >= $%d" % (len(params) + 1), from_dt)
    if to_dt:
        add("created_at <= $%d" % (len(params) + 1), to_dt)

    where_sql = "WHERE " + " AND ".join(where) if where else ""

    async with pool.acquire() as conn:
        total = await conn.fetchval(f"SELECT COUNT(*) FROM audit_logs {where_sql}", *params)
        rows = await conn.fetch(
            f"""
            SELECT id, actor_name, actor_email, actor_role, action_key, action_label, meta_json, created_at
            FROM audit_logs
            {where_sql}
            ORDER BY created_at DESC
            LIMIT {limit} OFFSET {offset}
            """,
            *params,
        )

    items = []
    for r in rows:
        items.append(
            {
                "id": r["id"],
                "actor_name": r["actor_name"],
                "actor_email": r["actor_email"],
                "actor_role": r["actor_role"],
                "action_key": r["action_key"],
                "action_label": r["action_label"],
                "meta": r["meta_json"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            }
        )

    return {"items": items, "total": total, "limit": limit, "offset": offset}
