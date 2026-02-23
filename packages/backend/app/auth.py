from datetime import datetime, timedelta
from typing import Optional
import bcrypt
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from .config import get_settings
security = HTTPBearer(auto_error=False)


def _utcnow() -> datetime:
    return datetime.utcnow()
def verify_password(plain_password: str, hashed_password: str) -> bool:
    if hashed_password.startswith("$2"):
        password_bytes = plain_password.encode('utf-8')
        hash_bytes = hashed_password.encode('utf-8')
        return bcrypt.checkpw(password_bytes, hash_bytes)
    return plain_password == hashed_password
def get_password_hash(password: str) -> str:
    password_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode('utf-8')
def create_access_token(user_id: int, role: str) -> str:
    settings = get_settings()
    access_minutes = int(getattr(settings, "ACCESS_TOKEN_MINUTES", 10))
    expire = _utcnow() + timedelta(minutes=access_minutes)
    to_encode = {
        "id": user_id,
        "role": role,
        "type": "access",
        "exp": expire
    }
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm="HS256")


def create_refresh_token(user_id: int, role: str) -> str:
    settings = get_settings()
    refresh_days = int(getattr(settings, "REFRESH_TOKEN_DAYS", 30))
    expire = _utcnow() + timedelta(days=refresh_days)
    to_encode = {
        "id": user_id,
        "role": role,
        "type": "refresh",
        "exp": expire,
    }
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm="HS256")

def decode_token(token: str) -> Optional[dict]:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        return payload
    except JWTError:
        return None


def decode_refresh_token(token: str) -> Optional[dict]:
    payload = decode_token(token)
    if not payload:
        return None
    if payload.get("type") != "refresh":
        return None
    return payload

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Optional[dict]:
    if credentials is None:
        return None
    token = credentials.credentials
    payload = decode_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    return payload

async def require_auth(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )
    user = await get_current_user(credentials)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    return user

async def require_admin(user: dict = Depends(require_auth)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return user

async def require_teacher(user: dict = Depends(require_auth)) -> dict:
    if user.get("role") != "teacher":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Teacher access required"
        )
    return user

async def require_student(user: dict = Depends(require_auth)) -> dict:
    if user.get("role") != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Student access required"
        )
    return user

async def require_admin_or_teacher(user: dict = Depends(require_auth)) -> dict:
    if user.get("role") not in ["admin", "teacher"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin or teacher access required"
        )
    return user
