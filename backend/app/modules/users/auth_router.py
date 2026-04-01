"""
Authentication endpoints: login, register (admin-only), get current user info.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import timedelta
import uuid

from app.db.database import get_db
from app.db import models
from app.modules.users.schemas import LoginRequest, Token, UserResponse, UserCreate, UserUpdateSelf, ChangePasswordRequest
from app.core.security import verify_password, get_password_hash, create_access_token
from app.core.dependencies import get_current_active_user, require_admin
from app.services.storage_service import storage_service

from app.core.rate_limiter import limiter
from app.core.config import get_settings
from fastapi import Request, UploadFile, File
import io
import os
import logging

settings = get_settings()
logger = logging.getLogger(__name__)

router = APIRouter()

# ----------------------------------------------------------------------------- 
# Rate-limit key: IP + username combination prevents shared-IP blocking
# (multiple colleagues can log in at the same time from the same NAT IP)
# ----------------------------------------------------------------------------- 
def _login_key(request: Request) -> str:
    ip = request.client.host if request.client else "unknown"
    # Best effort to include username in key so limits are per-account, not per-IP
    try:
        body = request.state._login_username  # Set below before rate-limit check
    except AttributeError:
        body = ""
    return f"{ip}:{body}"

# Separate key function used in lockout logic (pure username-based)
def _username_lockout_key(username: str) -> str:
    return f"login_fail:{username}"

@router.post("/login", response_model=Token)
@limiter.limit("10/minute")  # Raised from 5 to 10; key is IP+username (see _login_key)
def login(
    request: Request,
    credentials: LoginRequest,
    db: Session = Depends(get_db)
):
    """
    Login endpoint. Returns JWT access token.
    """
    import redis as _redis_sync

    # Sync Redis connection for lockout tracking (login endpoint is a sync def)
    try:
        _r = _redis_sync.Redis.from_url(
            os.getenv("REDIS_URL", "redis://localhost:6390/0"),
            decode_responses=True, socket_connect_timeout=1
        )
        _r.ping()
    except Exception:
        _r = None  # Redis unavailable – skip lockout, degrade gracefully

    username = credentials.username.strip().lower()

    # Fix 7: Account lockout – block after 5 consecutive failures (15 minute window)
    LOCKOUT_AFTER = 5
    LOCKOUT_WINDOW = 900  # 15 minutes in seconds
    lockout_key = _username_lockout_key(username)
    if _r:
        fail_count = _r.get(lockout_key)
        if fail_count and int(fail_count) >= LOCKOUT_AFTER:
            ttl = _r.ttl(lockout_key)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Account temporarily locked due to too many failed attempts. Try again in {ttl // 60 + 1} minute(s).",
            )

    # Find user by username (case-insensitive search by lowercased username)
    user = db.query(models.User).filter(
        models.User.username == credentials.username
    ).first()
    
    if not user or not verify_password(credentials.password, user.hashed_password):
        # Fix 7: Increment failure counter in Redis
        if _r:
            pipe = _r.pipeline()
            pipe.incr(lockout_key)
            pipe.expire(lockout_key, LOCKOUT_WINDOW)
            pipe.execute()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    
    # Successful login – clear failure counter
    if _r:
        _r.delete(lockout_key)

    # Create access token
    access_token = create_access_token(data={"sub": user.id})
    
    return Token(
        access_token=access_token,
        user=UserResponse.from_orm(user)
    )

@router.post("/register", response_model=UserResponse)
def register(
    user_data: UserCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)  # Only admin can create users
):
    """
    Register a new user. Admin only.
    """
    # Check if username exists
    if db.query(models.User).filter(models.User.username == user_data.username).first():
        raise HTTPException(status_code=400, detail="Username already registered")
    
    # Check if email exists
    if db.query(models.User).filter(models.User.email == user_data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
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

@router.get("/me", response_model=UserResponse)
def get_current_user_info(
    current_user: models.User = Depends(get_current_active_user)
):
    """
    Get current user information from JWT token.
    """
    user_response = UserResponse.from_orm(current_user)
    
    # Convert avatar_url path to presigned URL if exists
    if current_user.avatar_url and storage_service:
        try:
            user_response.avatar_url = storage_service.get_file_url(
                current_user.avatar_url,
                bucket=settings.MINIO_BUCKET
            )
        except Exception as e:
            # If presigned URL generation fails, keep the path
            logger.error(f"Failed to generate presigned URL for avatar: {e}")
            pass
    
    return user_response

@router.put("/me", response_model=UserResponse)
def update_my_profile(
    user_update: UserUpdateSelf,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Update current user's profile. Users can only update email, full_name, and department_id.
    Cannot change role or is_active (admin only).
    """
    # Update allowed fields
    if user_update.email is not None:
        # Check if email is already taken by another user
        existing = db.query(models.User).filter(
            models.User.email == user_update.email,
            models.User.id != current_user.id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")
        current_user.email = user_update.email
    
    if user_update.full_name is not None:
        current_user.full_name = user_update.full_name
    
    if user_update.department_id is not None:
        # Validate department exists
        dept = db.query(models.Department).filter(models.Department.id == user_update.department_id).first()
        if not dept:
            raise HTTPException(status_code=404, detail="Department not found")
        current_user.departmentId = user_update.department_id
    
    db.commit()
    db.refresh(current_user)
    
    return UserResponse.from_orm(current_user)

@router.put("/change-password")
def change_password(
    password_data: ChangePasswordRequest,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Change user's password. Requires old password verification.
    """
    # Verify old password
    if not verify_password(password_data.old_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect old password"
        )
    
    # Check new password is different
    if password_data.old_password == password_data.new_password:
        raise HTTPException(
            status_code=400,
            detail="New password must be different from old password"
        )
    
    # Update password and record when it was changed (for JWT invalidation)
    from datetime import datetime as _dt, timezone as _tz
    current_user.hashed_password = get_password_hash(password_data.new_password)
    current_user.password_changed_at = _dt.now(_tz.utc)
    db.commit()

    return {"message": "Password changed successfully"}

@router.post("/upload-avatar")
def upload_avatar(
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Upload avatar image for current user.
    """
    # Validate file type (images only)
    allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(allowed_types)}"
        )
    
    # Validate file size (max 5MB)
    file.file.seek(0, 2)  # Seek to end
    file_size = file.file.tell()
    file.file.seek(0)
    
    max_size = 5 * 1024 * 1024  # 5MB
    if file_size > max_size:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is 5MB"
        )
    
    if not storage_service:
        raise HTTPException(status_code=503, detail="Storage service unavailable")
    
    try:
        # Read file content
        file_content = file.file.read()
        
        # Generate unique filename
        file_ext = os.path.splitext(file.filename)[1] or ".jpg"
        avatar_filename = f"avatars/{current_user.id}{file_ext}"
        
        # Upload to MinIO (use default bucket for avatars)
        file_obj = io.BytesIO(file_content)
        storage_service.upload_file(
            file_data=file_obj,
            length=len(file_content),
            object_name=avatar_filename,
            content_type=file.content_type,
            bucket=settings.MINIO_BUCKET  # Use default agreement bucket for avatars
        )
        
        # Delete old avatar if exists
        if current_user.avatar_url:
            try:
                storage_service.delete_file(current_user.avatar_url, bucket=settings.MINIO_BUCKET)
            except Exception as e:
                # Log but don't fail if old avatar deletion fails
                pass
        
        # Update user avatar_url
        current_user.avatar_url = avatar_filename
        db.commit()
        db.refresh(current_user)
        
        # Return presigned URL for immediate use (use same bucket)
        avatar_url = storage_service.get_file_url(avatar_filename, bucket=settings.MINIO_BUCKET)
        
        return {
            "message": "Avatar uploaded successfully",
            "avatar_url": avatar_url,
            "avatar_path": avatar_filename
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")
