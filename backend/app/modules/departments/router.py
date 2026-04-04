"""
Department management endpoints (Admin only).
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import uuid

from app.db.database import get_db
from app.db import models
from app.modules.users.schemas import DepartmentResponse, DepartmentCreate, DepartmentUpdate
from app.core.dependencies import require_admin, get_current_active_user
from app.db.models import Department

router = APIRouter()

@router.get("", response_model=List[DepartmentResponse])
@router.get("/", response_model=List[DepartmentResponse])
def list_departments(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """List all departments. Available to all authenticated users (read-only)."""
    return db.query(Department).all()

@router.post("/", response_model=DepartmentResponse)
def create_department(
    dept_data: DepartmentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    """Create a new department."""
    if db.query(Department).filter(Department.name == dept_data.name).first():
        raise HTTPException(status_code=400, detail="Department name already exists")
    
    new_dept = Department(
        id=str(uuid.uuid4()),
        name=dept_data.name,
        description=dept_data.description
    )
    
    db.add(new_dept)
    db.commit()
    db.refresh(new_dept)
    return new_dept

@router.put("/{dept_id}", response_model=DepartmentResponse)
def update_department(
    dept_id: str,
    dept_update: DepartmentUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    """Update a department."""
    dept = db.query(Department).filter(Department.id == dept_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    
    if dept_update.name:
        # Check duplicate name if changing
        if dept_update.name != dept.name and \
           db.query(Department).filter(Department.name == dept_update.name).first():
            raise HTTPException(status_code=400, detail="Department name already exists")
        dept.name = dept_update.name
        
    if dept_update.description is not None:
        dept.description = dept_update.description
        
    db.commit()
    db.refresh(dept)
    return dept

@router.delete("/{dept_id}")
def delete_department(
    dept_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    """Delete a department."""
    dept = db.query(Department).filter(Department.id == dept_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    
    # Check if users are assigned
    if db.query(models.User).filter(models.User.departmentId == dept_id).first():
        raise HTTPException(status_code=400, detail="Cannot delete department with assigned users")
        
    db.delete(dept)
    db.commit()
    return {"message": "Department deleted successfully"}
