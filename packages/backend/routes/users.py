from fastapi import APIRouter, Depends
from app.database import get_connection
from app.auth import require_auth
router = APIRouter(prefix="/users", tags=["Users"])
@router.get("/me")
async def get_me(user: dict = Depends(require_auth)):
    user_id = user["id"]
    pool = await get_connection()
    row = await pool.fetchrow(
        "SELECT id, name, email, role, created_at FROM users WHERE id = $1",
        user_id
    )
    if not row:
        return {"error": "User not found"}, 404
    return {
        "user": {
            "id": row["id"],
            "name": row["name"],
            "email": row["email"],
            "role": row["role"],
            "created_at": str(row["created_at"]) if row["created_at"] else None
        }
    }
