from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Any, Dict

class AuditLogBase(BaseModel):
    action: str
    targetType: str
    targetId: str
    details: Optional[Dict[str, Any]] = None

class AuditLogCreate(AuditLogBase):
    userId: str

class AuditLogResponse(AuditLogBase):
    id: str
    userId: str
    timestamp: datetime
    userName: Optional[str] = None 

    class Config:
        from_attributes = True
