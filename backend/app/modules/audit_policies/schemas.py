from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

# AuditPolicy Rule Schema
class PlaybookRuleBase(BaseModel):
    category: str
    name: str
    description: str
    standardClause: str
    severity: str
    clauseRef: Optional[str] = None           # e.g. "1.12", "2.5"
    acceptableDeviation: Optional[str] = None  # what deviations are allowed
    approvalLevel: Optional[str] = None        # e.g. "BOD", "FNC/LEG", "LEG"

class PlaybookRuleCreate(PlaybookRuleBase):
    pass

class PlaybookRuleUpdate(BaseModel):
    category: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    standardClause: Optional[str] = None
    severity: Optional[str] = None
    clauseRef: Optional[str] = None
    acceptableDeviation: Optional[str] = None
    approvalLevel: Optional[str] = None

class PlaybookRule(PlaybookRuleBase):
    id: str
    auditPolicyId: str

    class Config:
        from_attributes = True

# AuditPolicy Schema
class PlaybookBase(BaseModel):
    name: str
    description: Optional[str] = None
    agreementTypeId: Optional[str] = None # NEW
    type: Optional[str] = 'audit_policy'  # 'audit_policy' or 'severity_rule'

class PlaybookCreate(PlaybookBase):
    agreementTypeId: Optional[str] = None
    type: Optional[str] = 'audit_policy'

class AuditPolicy(PlaybookBase):
    id: str
    fileUrl: str
    uploadedAt: datetime
    status: str
    agreementTypeId: Optional[str] = None
    createdBy: Optional[str] = None
    ruleCount: int = 0
    rules: List[PlaybookRule] = []
    type: Optional[str] = 'audit_policy'

    class Config:
        from_attributes = True
