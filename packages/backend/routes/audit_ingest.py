from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Request

from app.audit_log import log_action
from app.auth import require_admin

router = APIRouter(tags=["AuditLogs"])


@router.post("/admin/audit-log")
async def ingest_audit_log(
    request: Request,
    payload: dict[str, Any],
    admin_user=require_admin,
):
    action_key = payload.get("action_key")
    action_label = payload.get("action_label")
    meta: Optional[dict[str, Any]] = payload.get("meta")

    if not isinstance(action_key, str) or not action_key.strip():
        return {"success": False, "error": "action_key is required"}
    if not isinstance(action_label, str) or not action_label.strip():
        return {"success": False, "error": "action_label is required"}
    if meta is not None and not isinstance(meta, dict):
        return {"success": False, "error": "meta must be an object"}

    try:
        await log_action(
            actor=admin_user,
            action_key=action_key.strip(),
            action_label=action_label.strip(),
            request=request,
            meta=meta,
        )
    except Exception:
        pass

    return {"success": True}
