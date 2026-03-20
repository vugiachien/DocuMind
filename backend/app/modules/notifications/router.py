from fastapi import APIRouter, Request, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse
from app.core.redis_client import redis_client
from app.db.database import get_db
from app.core.dependencies import get_current_active_user
from app.core.security import decode_token
from app.db import models
from app.modules.notifications.service import notification_service
import asyncio
import logging
import json

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/")
def get_notifications(
    skip: int = 0,
    limit: int = 50,
    unread_only: bool = False,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """Get current user's notifications"""
    return notification_service.get_notifications(
        db, 
        current_user.id, 
        skip=skip, 
        limit=limit, 
        unread_only=unread_only
    )

@router.post("/{notification_id}/read")
def mark_notification_read(
    notification_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """Mark a notification as read"""
    success = notification_service.mark_as_read(db, notification_id, current_user.id)
    if not success:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"status": "success"}

@router.post("/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """Mark all notifications as read"""
    notification_service.mark_all_as_read(db, current_user.id)
    return {"status": "success"}

@router.get("/stream")
async def message_stream(
    request: Request,
    token: str = Query(None)
):
    """
    SSE Endpoint for real-time notifications.
    Subscribes to:
    1. Global 'contract_updates' channel
    2. Personal 'notifications:{user_id}' channel (if authenticated)
    """
    user_id = None
    if token:
        # Create a temporary session just for auth verification
        # DO NOT use Depends(get_db) because it keeps connection open during the whole SSE stream
        from app.db.database import SessionLocal
        db = SessionLocal()
        try:
            payload = decode_token(token)
            if payload:
                 user_id_from_token = payload.get("sub")
                 # Query by keys to get user_id
                 user = db.query(models.User).filter(models.User.id == user_id_from_token).first()
                 if user:
                     user_id = user.id
        except Exception as e:
            logger.warning(f"SSE Auth Failed: {e}")
        finally:
            db.close()

    async def event_generator():
        await redis_client.connect()
        
        # We need a new connection/pubsub for this client
        # redis_client is a wrapper, we need to access the underlying storage or method
        # The existing redis_client.subscribe is a generator.
        # We need to manually handle pubsub here to support multiple channels
        
        # Create a dedicated connection for this subscriber
        import redis.asyncio as redis
        # Use simple separate connection to avoid conflicts with shared pool if any
        r = redis.from_url(redis_client.redis_url, encoding="utf-8", decode_responses=True)
        pubsub = r.pubsub()
        
        channels = ["contract_updates"]
        if user_id:
            channels.append(f"notifications:{user_id}")
            logger.info(f"🔌 Client {user_id} connected to SSE stream")
        else:
            logger.info(f"🔌 Anonymous client connected to SSE stream")
            
        await pubsub.subscribe(*channels)
        
        try:
            async for message in pubsub.listen():
                if await request.is_disconnected():
                    logger.info("❌ Client disconnected from stream")
                    break
                
                if message["type"] == "message":
                    # logger.info(f"📤 Pushing SSE event: {message['channel']} -> {message['data']}")
                    yield {
                        "event": "message",
                        "data": message["data"]
                    }
        except asyncio.CancelledError:
            logger.info("❌ Stream cancelled")
        except Exception as e:
            logger.error(f"❌ SSE Stream Error: {e}")
        finally:
            await pubsub.close()
            await r.close()

    return EventSourceResponse(event_generator())
