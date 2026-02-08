from datetime import datetime, timezone
from typing import Optional, List
from app.database import get_connection


def _to_iso_utc(value: object) -> Optional[str]:
    if value is None:
        return None
    if not isinstance(value, datetime):
        return str(value)
    dt = value
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()
class NotificationType:
    RESCHEDULE_REQUEST_SUBMITTED = "reschedule_request_submitted"
    RESCHEDULE_REQUEST_APPROVED = "reschedule_request_approved"
    RESCHEDULE_REQUEST_REJECTED = "reschedule_request_rejected"
    LESSON_CANCELLED = "lesson_cancelled"
    LESSON_RESCHEDULED = "lesson_rescheduled"
    LESSON_REMINDER = "lesson_reminder"
    ADDED_TO_GROUP = "added_to_group"
    REMOVED_FROM_GROUP = "removed_from_group"
    GROUP_CLOSED = "group_closed"
    ATTENDANCE_MARKED = "attendance_marked"
    LOW_ATTENDANCE_WARNING = "low_attendance_warning"
    WELCOME = "welcome"
    SYSTEM = "system"
async def create_notification(
    user_id: int,
    notification_type: str,
    title: str,
    message: str,
    group_id: Optional[int] = None,
    related_id: Optional[int] = None,
    related_type: Optional[str] = None,
    action_url: Optional[str] = None,
    student_id: Optional[int] = None
) -> int:
    """
    Create a notification for a user.
    Args:
        user_id: The user ID to notify
        notification_type: Type of notification (use NotificationType constants)
        title: Notification title
        message: Notification message
        group_id: Related group ID (optional)
        related_id: Related entity ID (optional)
        related_type: Type of related entity (optional) - e.g., 'lesson', 'reschedule_request'
        action_url: URL to navigate to when clicking notification (optional)
        student_id: Student ID for backward compatibility (optional)
    Returns:
        The ID of the created notification
    """
    pool = await get_connection()
    result = await pool.fetchrow(
        """
        INSERT INTO notifications (
            user_id, student_id, type, title, message,
            group_id, related_id, related_type, action_url,
            is_read, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE, NOW())
        RETURNING id
        """,
        user_id, student_id, notification_type, title, message,
        group_id, related_id, related_type, action_url
    )
    return result["id"]
async def create_notifications_for_users(
    user_ids: List[int],
    notification_type: str,
    title: str,
    message: str,
    group_id: Optional[int] = None,
    related_id: Optional[int] = None,
    related_type: Optional[str] = None,
    action_url: Optional[str] = None
) -> List[int]:
    """
    Create notifications for multiple users.
    Returns:
        List of created notification IDs
    """
    notification_ids = []
    for user_id in user_ids:
        notification_id = await create_notification(
            user_id=user_id,
            notification_type=notification_type,
            title=title,
            message=message,
            group_id=group_id,
            related_id=related_id,
            related_type=related_type,
            action_url=action_url
        )
        notification_ids.append(notification_id)
    return notification_ids
async def notify_admins(
    notification_type: str,
    title: str,
    message: str,
    group_id: Optional[int] = None,
    related_id: Optional[int] = None,
    related_type: Optional[str] = None,
    action_url: Optional[str] = None
) -> List[int]:
    """
    Send notification to all admin users.
    """
    pool = await get_connection()
    admins = await pool.fetch("SELECT id FROM users WHERE role = 'admin'")
    admin_ids = [admin["id"] for admin in admins]
    return await create_notifications_for_users(
        user_ids=admin_ids,
        notification_type=notification_type,
        title=title,
        message=message,
        group_id=group_id,
        related_id=related_id,
        related_type=related_type,
        action_url=action_url
    )
async def notify_group_students(
    group_id: int,
    notification_type: str,
    title: str,
    message: str,
    related_id: Optional[int] = None,
    related_type: Optional[str] = None,
    action_url: Optional[str] = None
) -> List[int]:
    """
    Send notification to all students in a group.
    """
    pool = await get_connection()
    students = await pool.fetch(
        """
        SELECT u.id as user_id, s.id as student_id
        FROM group_students gs
        JOIN students s ON gs.student_id = s.id
        JOIN users u ON s.user_id = u.id
        WHERE gs.group_id = $1
        """,
        group_id
    )
    notification_ids = []
    for student in students:
        notification_id = await create_notification(
            user_id=student["user_id"],
            student_id=student["student_id"],
            notification_type=notification_type,
            title=title,
            message=message,
            group_id=group_id,
            related_id=related_id,
            related_type=related_type,
            action_url=action_url
        )
        notification_ids.append(notification_id)
    return notification_ids
async def notify_teacher_of_group(
    group_id: int,
    notification_type: str,
    title: str,
    message: str,
    related_id: Optional[int] = None,
    related_type: Optional[str] = None,
    action_url: Optional[str] = None
) -> Optional[int]:
    """
    Send notification to the teacher of a group.
    """
    pool = await get_connection()
    teacher = await pool.fetchrow(
        """
        SELECT u.id as user_id
        FROM groups g
        JOIN group_teachers gt ON gt.group_id = g.id AND COALESCE(gt.is_main, FALSE) = TRUE
        JOIN teachers t ON t.id = gt.teacher_id
        JOIN users u ON u.id = t.user_id
        WHERE g.id = $1
        """,
        group_id
    )
    if not teacher:
        teacher = await pool.fetchrow(
            """
            SELECT u.id as user_id
            FROM groups g
            JOIN teachers t ON g.teacher_id = t.id
            JOIN users u ON t.user_id = u.id
            WHERE g.id = $1
            """,
            group_id
        )
    if not teacher:
        return None
    return await create_notification(
        user_id=teacher["user_id"],
        notification_type=notification_type,
        title=title,
        message=message,
        group_id=group_id,
        related_id=related_id,
        related_type=related_type,
        action_url=action_url
    )
async def get_user_notifications(
    user_id: int,
    limit: int = 50,
    unread_only: bool = False
) -> List[dict]:
    """
    Get notifications for a user.
    """
    pool = await get_connection()
    query = """
        SELECT id, type, group_id, title, message, is_read,
               action_url, related_id, related_type, created_at
        FROM notifications
        WHERE user_id = $1
    """
    if unread_only:
        query += " AND is_read = FALSE"
    query += " ORDER BY created_at DESC LIMIT $2"
    rows = await pool.fetch(query, user_id, limit)
    return [
        {
            "id": r["id"],
            "type": r["type"],
            "group_id": r["group_id"],
            "title": r["title"],
            "message": r["message"],
            "is_read": r["is_read"],
            "action_url": r["action_url"],
            "related_id": r["related_id"],
            "related_type": r["related_type"],
            "created_at": _to_iso_utc(r["created_at"])
        }
        for r in rows
    ]
async def get_unread_count(user_id: int) -> int:
    """
    Get count of unread notifications for a user.
    """
    pool = await get_connection()
    result = await pool.fetchrow(
        "SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = FALSE",
        user_id
    )
    return result["count"] if result else 0
async def mark_notification_as_read(notification_id: int, user_id: int) -> bool:
    """
    Mark a notification as read.
    """
    pool = await get_connection()
    result = await pool.execute(
        "UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2",
        notification_id, user_id
    )
    return "UPDATE 1" in result
async def mark_all_as_read(user_id: int) -> int:
    """
    Mark all notifications as read for a user.
    """
    pool = await get_connection()
    result = await pool.execute(
        "UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE",
        user_id
    )
    try:
        count = int(result.split(" ")[1])
    except:
        count = 0
    return count
async def delete_notification(notification_id: int, user_id: int) -> bool:
    """
    Delete a notification.
    """
    pool = await get_connection()
    result = await pool.execute(
        "DELETE FROM notifications WHERE id = $1 AND user_id = $2",
        notification_id, user_id
    )
    return "DELETE 1" in result
