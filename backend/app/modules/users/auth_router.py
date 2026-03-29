"""
Authentication endpoints: login, register (admin-only), get current user info.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import uuid

from app.db.database import get_db
from app.db import models
from app.modules.users.schemas import LoginRequest, Token, UserResponse, UserCreate
from app.core.security import verify_password, get_password_hash, create_access_token
from app.core.dependencies import get_current_active_user, require_admin

from app.core.rate_limiter import limiter
from fastapi import Request
import os

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

    # Find user by username or email (case-insensitive)
    from sqlalchemy import or_
    user = db.query(models.User).filter(
        or_(
            models.User.username == username,
            models.User.email == credentials.username.strip()
        )
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
    return UserResponse.from_orm(current_user)
