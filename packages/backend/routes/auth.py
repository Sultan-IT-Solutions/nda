from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional
from app.database import get_connection
from app.auth import verify_password, get_password_hash, create_access_token
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
    token: str
    user: dict
@router.post("/register")
async def register(data: RegisterRequest):
    errors = {}
    if not data.full_name:
        errors["full_name"] = "Имя обязательно"
    if not data.email:
        errors["email"] = "Email обязателен"
    if not data.password:
        errors["password"] = "Пароль обязателен"
    if not data.password_confirm:
        errors["password_confirm"] = "Подтверждение пароля обязательно"
    if data.password != data.password_confirm:
        errors["password_confirm"] = "Пароли не совпадают"
    if errors:
        raise HTTPException(status_code=400, detail={"errors": errors})
    pool = await get_connection()
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
async def login(data: LoginRequest):
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
    token = create_access_token(user_id, role)
    print(f"User logged in: {data.email} (role: {role})")
    return {
        "token": token,
        "user": {
            "id": user_id,
            "name": name,
            "email": data.email,
            "role": role
        }
    }
