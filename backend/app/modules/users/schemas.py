"""
Pydantic schemas for User and Authentication.
"""
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


# Department Schemas
class DepartmentBase(BaseModel):
    name: str
    description: Optional[str] = None

class DepartmentCreate(DepartmentBase):
    pass

class DepartmentUpdate(DepartmentBase):
    name: Optional[str] = None

class DepartmentResponse(DepartmentBase):
    id: str
    created_at: datetime
    
    class Config:
        from_attributes = True

# User Schemas
class UserBase(BaseModel):
    username: str
    email: EmailStr
    full_name: Optional[str] = None
    department_id: Optional[str] = None  # Add department_id input

class UserCreate(UserBase):
    password: str
    role: str = "user"  # "admin" or "user"

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    department_id: Optional[str] = None

class UserUpdateSelf(BaseModel):
    """Schema for users to update their own profile (no role/is_active changes)"""
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    department_id: Optional[str] = None

class ChangePasswordRequest(BaseModel):
    """Schema for changing password"""
    old_password: str
    new_password: str

class UserResponse(UserBase):
    id: str
    role: str
    is_active: bool
    created_at: datetime
    avatar_url: Optional[str] = None  # URL to avatar image
    department: Optional[DepartmentResponse] = None  # Include full department info
    
    class Config:
        from_attributes = True

# Auth Schemas
class LoginRequest(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
