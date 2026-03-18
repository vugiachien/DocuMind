from sqlalchemy.orm import Session
from app.db import models
from app.core.redis_client import redis_client
import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

class NotificationService:
    def create_notification(
        self, 
        db: Session, 
        user_id: str, 
        title: str, 
        message: str, 
        type: str = "info",
        link: str = None,
        payload: dict = None
    ):
        """
        Create a notification (Sync Version):
        1. Save to Database
        2. Push to Redis for real-time delivery via SSE
        """
        import redis
        import os
        
        try:
            # 1. Save to DB
            notification = models.Notification(
                userId=user_id,
                title=title,
                message=message,
                type=type,
                link=link,
                createdAt=datetime.utcnow(),
                isRead=False
            )
            db.add(notification)
            db.commit()
            db.refresh(notification)

            # 2. Push to Redis (SSE) - Sync
            # Channel: "notifications:{user_id}"
            channel = f"notifications:{user_id}"
            redis_payload = {
                "id": notification.id,
                "title": notification.title,
                "message": notification.message,
                "type": notification.type,
                "link": notification.link,
                "createdAt": notification.createdAt.isoformat(),
                "payload": payload # Extra metadata for frontend optimizations
            }
            
            redis_url = os.getenv("REDIS_URL", "redis://localhost:6390/0")
            r = redis.from_url(redis_url)
            r.publish(channel, json.dumps(redis_payload))
            
            # Optionally send email here (Placeholder)
            self._send_email(user_id, title, message)
            
            return notification
        except Exception as e:
            logger.error(f"Failed to create notification: {e}")
            return None

    def get_notifications(
        self, 
        db: Session, 
        user_id: str, 
        skip: int = 0, 
        limit: int = 20,
        unread_only: bool = False
    ):
        """Get user notifications"""
        query = db.query(models.Notification).filter(models.Notification.userId == user_id)
        
        if unread_only:
            query = query.filter(models.Notification.isRead == False)
            
        return query.order_by(models.Notification.createdAt.desc()).offset(skip).limit(limit).all()

    def mark_as_read(self, db: Session, notification_id: str, user_id: str):
        """Mark a notification as read"""
        notification = db.query(models.Notification).filter(
            models.Notification.id == notification_id,
            models.Notification.userId == user_id
        ).first()
        
        if notification:
            notification.isRead = True
            db.commit()
            return True
        return False

    def mark_all_as_read(self, db: Session, user_id: str):
        """Mark all notifications as read for a user"""
        db.query(models.Notification).filter(
            models.Notification.userId == user_id,
            models.Notification.isRead == False
        ).update({"isRead": True})
        db.commit()

    def _send_email(self, user_id: str, title: str, message: str):
        """Placeholder for email sending"""
        # In a real app, you'd lookup user email and use SMTP/SendGrid
        logger.info(f"📧 [EMAIL_MOCK] To {user_id}: {title} - {message}")

notification_service = NotificationService()
