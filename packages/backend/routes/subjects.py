from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from typing import List, Optional
import asyncpg
from app.database import get_connection
from app.auth import require_auth, require_admin

router = APIRouter(prefix="/subjects", tags=["subjects"])


class SubjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    color: str = "#3B82F6"


class SubjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None


class SubjectResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    color: str
    created_at: str


@router.get("", response_model=List[SubjectResponse], include_in_schema=False)
@router.get("/", response_model=List[SubjectResponse])
async def get_subjects(
    pool: asyncpg.Pool = Depends(get_connection),
    current_user=Depends(require_auth),
):
    try:
        async with pool.acquire() as conn:
            query = """
                SELECT id, name, description, color, created_at
                FROM subjects
                ORDER BY name
            """
            rows = await conn.fetch(query)
            return [
                SubjectResponse(
                    id=row["id"],
                    name=row["name"],
                    description=row["description"],
                    color=row["color"],
                    created_at=row["created_at"].isoformat(),
                )
                for row in rows
            ]
    except Exception as exc:
        print(f"Error fetching subjects: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch subjects",
        )


@router.post("", response_model=SubjectResponse, include_in_schema=False)
@router.post("/", response_model=SubjectResponse)
async def create_subject(
    subject: SubjectCreate,
    pool: asyncpg.Pool = Depends(get_connection),
    current_user=Depends(require_admin),
):
    try:
        async with pool.acquire() as conn:
            query = """
                INSERT INTO subjects (name, description, color)
                VALUES ($1, $2, $3)
                RETURNING id, name, description, color, created_at
            """
            row = await conn.fetchrow(
                query,
                subject.name,
                subject.description,
                subject.color,
            )
            return SubjectResponse(
                id=row["id"],
                name=row["name"],
                description=row["description"],
                color=row["color"],
                created_at=row["created_at"].isoformat(),
            )
    except asyncpg.exceptions.UniqueViolationError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Subject with this name already exists",
        )
    except Exception as exc:
        print(f"Error creating subject: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create subject",
        )


@router.put("/{subject_id}", response_model=SubjectResponse)
async def update_subject(
    subject_id: int,
    subject: SubjectUpdate,
    pool: asyncpg.Pool = Depends(get_connection),
    current_user=Depends(require_admin),
):
    try:
        async with pool.acquire() as conn:
            existing = await conn.fetchrow("SELECT * FROM subjects WHERE id = $1", subject_id)
            if not existing:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Subject not found",
                )

            update_fields = []
            values = []
            param_count = 1
            if subject.name is not None:
                update_fields.append(f"name = ${param_count}")
                values.append(subject.name)
                param_count += 1
            if subject.description is not None:
                update_fields.append(f"description = ${param_count}")
                values.append(subject.description)
                param_count += 1
            if subject.color is not None:
                update_fields.append(f"color = ${param_count}")
                values.append(subject.color)
                param_count += 1

            if not update_fields:
                return SubjectResponse(
                    id=existing["id"],
                    name=existing["name"],
                    description=existing["description"],
                    color=existing["color"],
                    created_at=existing["created_at"].isoformat(),
                )

            values.append(subject_id)
            query = f"""
                UPDATE subjects
                SET {', '.join(update_fields)}
                WHERE id = ${param_count}
                RETURNING id, name, description, color, created_at
            """
            row = await conn.fetchrow(query, *values)
            return SubjectResponse(
                id=row["id"],
                name=row["name"],
                description=row["description"],
                color=row["color"],
                created_at=row["created_at"].isoformat(),
            )
    except asyncpg.exceptions.UniqueViolationError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Subject with this name already exists",
        )
    except Exception as exc:
        print(f"Error updating subject: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update subject",
        )


@router.delete("/{subject_id}")
async def delete_subject(
    subject_id: int,
    pool: asyncpg.Pool = Depends(get_connection),
    current_user=Depends(require_admin),
):
    try:
        async with pool.acquire() as conn:
            existing = await conn.fetchrow("SELECT * FROM subjects WHERE id = $1", subject_id)
            if not existing:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Subject not found",
                )

            class_subjects_count = await conn.fetchval(
                "SELECT COUNT(*) FROM class_subjects WHERE subject_id = $1",
                subject_id,
            )
            transcript_records_count = await conn.fetchval(
                "SELECT COUNT(*) FROM transcript_records WHERE subject_id = $1",
                subject_id,
            )
            transcript_publications_count = await conn.fetchval(
                "SELECT COUNT(*) FROM transcript_publications WHERE subject_id = $1",
                subject_id,
            )
            in_use = (
                (class_subjects_count or 0)
                + (transcript_records_count or 0)
                + (transcript_publications_count or 0)
            )
            if in_use > 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot delete subject. It is used in classes or transcripts",
                )

            await conn.execute("DELETE FROM subjects WHERE id = $1", subject_id)
            return {"message": "Subject deleted successfully"}
    except HTTPException:
        raise
    except Exception as exc:
        print(f"Error deleting subject: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete subject",
        )
