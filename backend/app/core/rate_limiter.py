import logging
import os

import redis
from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core import security

logger = logging.getLogger(__name__)

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

def _resolve_rate_limit_storage() -> str:
    storage_uri = os.getenv("RATE_LIMIT_STORAGE_URI") or os.getenv("REDIS_URL", "redis://localhost:6390/0")

    if storage_uri.startswith(("redis://", "rediss://")):
        try:
            client = redis.Redis.from_url(
                storage_uri,
                decode_responses=True,
                socket_connect_timeout=0.5,
                socket_timeout=0.5,
            )
            client.ping()
        except Exception as exc:
            logger.warning(
                "Redis unavailable for rate limiting at %s. Falling back to in-memory storage.",
                storage_uri,
            )
            logger.debug("Rate limiter Redis probe failed", exc_info=exc)
            return "memory://"

    return storage_uri


limiter = Limiter(key_func=get_hybrid_key, storage_uri=_resolve_rate_limit_storage())
