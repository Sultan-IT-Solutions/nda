from fastapi import APIRouter, HTTPException, Depends
from app.auth import require_auth
from app.notifications import (
    get_user_notifications,
    get_unread_count,
    mark_notification_as_read,
    mark_all_as_read,
    delete_notification
)
router = APIRouter(prefix="/notifications", tags=["Notifications"])
@router.get("")
async def get_notifications(
    limit: int = 50,
    unread_only: bool = False,
    user: dict = Depends(require_auth)
):

    user_id = user["id"]
    notifications = await get_user_notifications(
        user_id=user_id,
        limit=limit,
        unread_only=unread_only
    )
    unread_count = await get_unread_count(user_id)
    return {
        "notifications": notifications,
        "unread_count": unread_count
    }
@router.get("/unread-count")
async def get_notifications_unread_count(user: dict = Depends(require_auth)):
    user_id = user["id"]
    count = await get_unread_count(user_id)
    return {"unread_count": count}

@router.post("/{notification_id}/read")
async def mark_as_read(notification_id: int, user: dict = Depends(require_auth)):
    user_id = user["id"]
    success = await mark_notification_as_read(notification_id, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Notification marked as read"}

@router.post("/read-all")
async def mark_all_notifications_as_read(user: dict = Depends(require_auth)):
    user_id = user["id"]
    count = await mark_all_as_read(user_id)
    return {"message": f"Marked {count} notifications as read", "count": count}

@router.delete("/{notification_id}")
async def delete_notification_route(notification_id: int, user: dict = Depends(require_auth)):
    user_id = user["id"]
    success = await delete_notification(notification_id, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Notification deleted"}
