from datetime import datetime, date
from sqlalchemy.orm import Session
from app.db.models import AuditLog, User
from typing import List, Optional
import json

class AuditService:
    @staticmethod
    def log_activity(db: Session, user_id: str, action: str, target_type: str, target_id: str, details: dict = None):
        """
        Log a user activity.
        """
        try:
            # Ensure details are JSON serializable (handle datetime)
            if details:
                def json_serial(obj):
                    if isinstance(obj, (datetime, date)):
                        return obj.isoformat()
                    return str(obj)
                
                # Round-trip through JSON to convert types
                details = json.loads(json.dumps(details, default=json_serial))

            audit_log = AuditLog(
                userId=user_id,
                action=action,
                targetType=target_type,
                targetId=target_id,
                details=details
            )
            db.add(audit_log)
            db.commit()
            db.refresh(audit_log)
            return audit_log
        except Exception as e:
            print(f"Error logging activity: {e}")
            db.rollback()
            return None

    @staticmethod
    def get_contract_history(db: Session, contract_id: str) -> List[AuditLog]:
        """
        Get audit logs for a specific agreement.
        """
        return db.query(AuditLog).filter(
            AuditLog.targetType == "AGREEMENT",
            AuditLog.targetId == contract_id
        ).order_by(AuditLog.timestamp.desc()).all()

    @staticmethod
    def get_user_history(db: Session, user_id: str) -> List[AuditLog]:
        """
        Get audit logs for a specific user.
        """
        return db.query(AuditLog).filter(
            AuditLog.userId == user_id
        ).order_by(AuditLog.timestamp.desc()).all()
