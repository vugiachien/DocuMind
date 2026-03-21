import os
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from fastapi import Request
from app.core import security

def get_hybrid_key(request: Request) -> str:
    """
    Hybrid Rate Limiting Key:
    - If user is authenticated (JWT in header), use User ID.
    - If anonymous, use IP Address.
    """
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        try:
            payload = security.decode_token(token)
            if payload and "sub" in payload:
                return f"user:{payload['sub']}"  # Rate limit by User ID
        except Exception:
            pass # Fallback to IP if token invalid
            
    return get_remote_address(request) # Rate limit by IP

redis_url = os.getenv("REDIS_URL", "redis://localhost:6390/0")
limiter = Limiter(key_func=get_hybrid_key, storage_uri=redis_url)
