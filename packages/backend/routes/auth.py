from fastapi import APIRouter, HTTPException, Response, Request
from pydantic import BaseModel, EmailStr
from typing import Optional
from app.database import get_connection
from app.auth import verify_password, get_password_hash, create_access_token, create_refresh_token, decode_refresh_token
from app.config import get_settings
from app.system_settings import get_bool_setting
router = APIRouter(prefix="/auth", tags=["Authentication"])
class RegisterRequest(BaseModel):
    full_name: str
    email: EmailStr
    phone: Optional[str] = None
    password: str
    password_confirm: str
class LoginRequest(BaseModel):
    email: EmailStr
    password: str
class LoginResponse(BaseModel):
    access_token: str
    token: Optional[str] = None
    user: dict
@router.post("/register")
async def register(data: RegisterRequest):
    pool = await get_connection()
    registration_enabled = await get_bool_setting(pool, "registration.enabled", default=True)
    if not registration_enabled:
        raise HTTPException(status_code=403, detail="Регистрация временно отключена")

    errors = {}
    if not data.full_name:
        errors["full_name"] = "Имя обязательно"
    if not data.email:
        errors["email"] = "Email обязателен"
    if not data.password:
        errors["password"] = "Пароль обязателен"
    if not data.password_confirm:
        errors["password_confirm"] = "Подтверждение пароля обязательно"
    if data.password and len(data.password) < 6:
        errors["password"] = "Пароль должен быть минимум 6 символов"
    if data.password != data.password_confirm:
        errors["password_confirm"] = "Пароли не совпадают"
    if errors:
        raise HTTPException(status_code=400, detail={"errors": errors})
    existing = await pool.fetchrow(
        "SELECT id FROM users WHERE email = $1",
        data.email
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail={"errors": {"email": "Email уже зарегистрирован"}}
        )
    hashed_password = get_password_hash(data.password)
    async with pool.acquire() as conn:
        async with conn.transaction():
            user_row = await conn.fetchrow(
                """
                INSERT INTO users (name, email, password, role)
                VALUES ($1, $2, $3, $4)
                RETURNING id
                """,
                data.full_name, data.email, hashed_password, "student"
            )
            user_id = user_row["id"]
            await conn.execute(
                """
                INSERT INTO students (user_id, phone_number)
                VALUES ($1, $2)
                """,
                user_id, data.phone or ""
            )
    print(f"Registered new student: {data.email} (user_id: {user_id})")
    return {"message": "User registered successfully"}
@router.post("/login", response_model=LoginResponse)
async def login(data: LoginRequest, response: Response):
    if not data.email or not data.password:
        raise HTTPException(status_code=400, detail="Требуются email и пароль")
    pool = await get_connection()
    result = await pool.fetchrow(
        "SELECT id, role, password, name FROM users WHERE email = $1",
        data.email
    )
    if not result:
        raise HTTPException(status_code=401, detail="Неверный email или пароль")
    stored_hash = result["password"]
    if not verify_password(data.password, stored_hash):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")
    user_id = result["id"]
    role = result["role"]
    name = result["name"]
    access_token = create_access_token(user_id, role)
    refresh_token = create_refresh_token(user_id, role)

    settings = get_settings()
    is_prod = str(getattr(settings, "ENV", "development")).lower() == "production"
    max_age = int(getattr(settings, "REFRESH_TOKEN_DAYS", 30)) * 24 * 60 * 60


    cookie_samesite = "none" if is_prod else "lax"

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=is_prod,
        samesite=cookie_samesite,
        path="/",
        max_age=max_age,
    )
    print(f"User logged in: {data.email} (role: {role})")
    return {
        "access_token": access_token,
        "token": access_token,
        "user": {
            "id": user_id,
            "name": name,
            "email": data.email,
            "role": role
        }
    }


class RefreshResponse(BaseModel):
    access_token: str


@router.post("/refresh", response_model=RefreshResponse)
async def refresh(request: Request):
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Missing refresh token")

    payload = decode_refresh_token(refresh_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    user_id = payload.get("id")
    role = payload.get("role")
    if user_id is None or role is None:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    access_token = create_access_token(int(user_id), str(role))
    return {"access_token": access_token}


@router.post("/logout")
async def logout(response: Response):
    settings = get_settings()
    is_prod = str(getattr(settings, "ENV", "development")).lower() == "production"
    cookie_samesite = "none" if is_prod else "lax"

    response.delete_cookie(
        key="refresh_token",
        path="/",
        secure=is_prod,
        samesite=cookie_samesite,
    )
    return {"ok": True}
