from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from typing import List, Optional
import asyncpg
from app.database import get_connection
from app.auth import require_auth, require_admin
router = APIRouter(prefix="/categories", tags=["categories"])
class CategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None
    color: str = "#3B82F6"
class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
class CategoryResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    color: str
    created_at: str
@router.get("", response_model=List[CategoryResponse], include_in_schema=False)
@router.get("/", response_model=List[CategoryResponse])
async def get_categories(
    pool: asyncpg.Pool = Depends(get_connection),
    current_user=Depends(require_auth)
):
    try:
        async with pool.acquire() as conn:
            query = """
                SELECT id, name, description, color, created_at
                FROM categories
                ORDER BY name
            """
            rows = await conn.fetch(query)
            return [
                CategoryResponse(
                    id=row['id'],
                    name=row['name'],
                    description=row['description'],
                    color=row['color'],
                    created_at=row['created_at'].isoformat()
                )
                for row in rows
            ]
    except Exception as e:
        print(f"Error fetching categories: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch categories"
        )
@router.post("", response_model=CategoryResponse, include_in_schema=False)
@router.post("/", response_model=CategoryResponse)
async def create_category(
    category: CategoryCreate,
    pool: asyncpg.Pool = Depends(get_connection),
    current_user=Depends(require_admin)
):
    """Create a new category"""
    try:
        async with pool.acquire() as conn:
            query = """
                INSERT INTO categories (name, description, color)
                VALUES ($1, $2, $3)
                RETURNING id, name, description, color, created_at
            """
            row = await conn.fetchrow(
                query,
                category.name,
                category.description,
                category.color
            )
            return CategoryResponse(
                id=row['id'],
                name=row['name'],
                description=row['description'],
                color=row['color'],
                created_at=row['created_at'].isoformat()
            )
    except asyncpg.exceptions.UniqueViolationError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Category with this name already exists"
        )
    except Exception as e:
        print(f"Error creating category: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create category"
        )
@router.put("/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: int,
    category: CategoryUpdate,
    pool: asyncpg.Pool = Depends(get_connection),
    current_user=Depends(require_admin)
):
    try:
        async with pool.acquire() as conn:
            existing = await conn.fetchrow("SELECT * FROM categories WHERE id = $1", category_id)
            if not existing:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Category not found"
                )
            update_fields = []
            values = []
            param_count = 1
            if category.name is not None:
                update_fields.append(f"name = ${param_count}")
                values.append(category.name)
                param_count += 1
            if category.description is not None:
                update_fields.append(f"description = ${param_count}")
                values.append(category.description)
                param_count += 1
            if category.color is not None:
                update_fields.append(f"color = ${param_count}")
                values.append(category.color)
                param_count += 1
            if not update_fields:
                return CategoryResponse(
                    id=existing['id'],
                    name=existing['name'],
                    description=existing['description'],
                    color=existing['color'],
                    created_at=existing['created_at'].isoformat()
                )
            values.append(category_id)
            query = f"""
                UPDATE categories
                SET {', '.join(update_fields)}
                WHERE id = ${param_count}
                RETURNING id, name, description, color, created_at
            """
            row = await conn.fetchrow(query, *values)
            return CategoryResponse(
                id=row['id'],
                name=row['name'],
                description=row['description'],
                color=row['color'],
                created_at=row['created_at'].isoformat()
            )
    except asyncpg.exceptions.UniqueViolationError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Category with this name already exists"
        )
    except Exception as e:
        print(f"Error updating category: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update category"
        )
@router.delete("/{category_id}")
async def delete_category(
    category_id: int,
    pool: asyncpg.Pool = Depends(get_connection),
    current_user=Depends(require_admin)
):
    try:
        async with pool.acquire() as conn:
            existing = await conn.fetchrow("SELECT * FROM categories WHERE id = $1", category_id)
            if not existing:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Category not found"
                )
            groups_using = await conn.fetchval(
                "SELECT COUNT(*) FROM groups WHERE category_id = $1",
                category_id
            )
            if groups_using > 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot delete category. It is being used by {groups_using} group(s)"
                )
            await conn.execute("DELETE FROM categories WHERE id = $1", category_id)
            return {"message": "Category deleted successfully"}
    except Exception as e:
        print(f"Error deleting category: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete category"
        )
