"""
User management endpoints (Admin only).
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import uuid

from app.db.database import get_db
from app.db import models
from app.modules.users.schemas import UserResponse, UserCreate, UserUpdate
from app.core.security import get_password_hash
from app.core.dependencies import require_admin, get_current_active_user
from sqlalchemy import or_

router = APIRouter()

@router.get("/search", response_model=List[UserResponse])
def search_users(
    q: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """Search users by name or username (for sharing)."""
    users = db.query(models.User).filter(
        or_(
            models.User.username.ilike(f"%{q}%"),
            models.User.full_name.ilike(f"%{q}%")
        )
    ).limit(10).all()
    return [UserResponse.from_orm(u) for u in users]

@router.get("/", response_model=List[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    """List all users. Admin only."""
    users = db.query(models.User).all()
    return [UserResponse.from_orm(u) for u in users]

@router.post("/", response_model=UserResponse)
def create_user(
    user_data: UserCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    """Create a new user. Admin only."""
    # Check duplicates
    if db.query(models.User).filter(models.User.username == user_data.username).first():
        raise HTTPException(status_code=400, detail="Username already exists")
    
    if db.query(models.User).filter(models.User.email == user_data.email).first():
        raise HTTPException(status_code=400, detail="Email already exists")
    
    new_user = models.User(
        id=str(uuid.uuid4()),
        username=user_data.username,
        email=user_data.email,
        full_name=user_data.full_name,
        hashed_password=get_password_hash(user_data.password),
        role=user_data.role,
        departmentId=user_data.department_id
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return UserResponse.from_orm(new_user)

@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: str,
    user_update: UserUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    """Update a user. Admin only."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Update fields
    if user_update.email:
        user.email = user_update.email
    if user_update.full_name:
        user.full_name = user_update.full_name
    if user_update.password:
        user.hashed_password = get_password_hash(user_update.password)
    if user_update.role:
        user.role = user_update.role
    if user_update.is_active is not None:
        user.is_active = user_update.is_active
    if user_update.department_id is not None:
        user.departmentId = user_update.department_id
    
    db.commit()
    db.refresh(user)
    
    return UserResponse.from_orm(user)

@router.delete("/{user_id}")
def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    """Delete a user. Admin only."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Prevent self-deletion
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    # Prevent deleting admin users
    if user.role == "admin":
        # Count remaining admins
        admin_count = db.query(models.User).filter(
            models.User.role == "admin",
            models.User.is_active == True
        ).count()
        
        if admin_count <= 1:
            raise HTTPException(
                status_code=400, 
                detail="Cannot delete the last admin user. System must have at least one admin."
            )
        
        raise HTTPException(
            status_code=400,
            detail="Cannot delete admin users. Please change role to 'user' first if needed."
        )
    
    db.delete(user)
    db.commit()
    
    return {"message": "User deleted successfully"}
