from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

# Agreement Status Type
ContractStatus = str  # 'draft', 'review', 'update', 'negotiation', 'manager_review', 'approval', 'signing'

# Finding Schema
class Finding(BaseModel):
    id: str
    description: str
    severity: str
    page: int
    section_index: Optional[int] = 0
    section: Optional[str] = None
    term: Optional[str] = None
    quote: Optional[str] = None
    recommendation: Optional[str] = None
    original_text: Optional[str] = None
    suggested_text: Optional[str] = None
    auto_fixable: Optional[bool] = True
    risk_type: Optional[str] = "modification"
    risk_source: Optional[str] = "audit_policy"
    confidence_score: Optional[int] = None  # 0-100: AI confidence in this finding
    
    class Config:
        from_attributes = True

# Finding Update Schema
class RiskUpdateSuggestion(BaseModel):
    updated_text: str


# Partner Schema
class PartnerBase(BaseModel):
    name: str
    taxCode: str
    representative: str
    address: Optional[str] = None
    email: Optional[str] = None

class PartnerCreate(PartnerBase):
    pass

class Partner(PartnerBase):
    id: str

# Agreement Type Schema
class ContractTypeBase(BaseModel):
    code: str
    name: str
    description: Optional[str] = None

class ContractTypeCreate(ContractTypeBase):
    pass

class ContractType(ContractTypeBase):
    id: str
    templateUrl: Optional[str] = None  # MinIO path to template DOCX (if set)
    htmlPreview: Optional[str] = None  # Cached HTML render of template

    class Config:
        from_attributes = True

# Agreement Schema
class ContractBase(BaseModel):
    name: str
    partnerId: Optional[str] = None
    agreementTypeId: Optional[str] = None
    value: float
    effectiveDate: datetime
    expiryDate: datetime

class ContractCreate(ContractBase):
    contractNumber: Optional[str] = None
    auditPolicyId: Optional[str] = None  # NEW: Rule Type selection
    notes: Optional[str] = None
    value: float = 0

# Agreement Version Schema
class ContractVersion(BaseModel):
    id: str
    version: str
    fileUrl: str
    uploadedAt: datetime
    uploadedBy: Optional[str] = None
    changes: Optional[str] = None
    # Origin type: 'template' | 'upload' | 'ai_fix' | 'manual_edit'
    versionType: Optional[str] = 'upload'

    class Config:
        from_attributes = True

# Agreement Share Schema
class ContractShareBase(BaseModel):
    sharedType: str # 'user' or 'department'
    targetId: str
    permission: str = "view" 

class ContractShareCreate(ContractShareBase):
    pass

class ContractShare(ContractShareBase):
    id: str
    agreementId: str
    sharedAt: datetime
    sharedBy: str
    targetName: Optional[str] = None # Helper for UI: User Name or Dept Name

    class Config:
        from_attributes = True

class Agreement(ContractBase):
    id: str
    contractNumber: Optional[str] = None
    partnerName: Optional[str] = None
    contractTypeName: Optional[str] = None
    status: ContractStatus
    createdBy: str
    createdAt: datetime
    updatedAt: datetime
    currentVersion: str
    fileUrl: Optional[str] = None
    ownerId: Optional[str] = None
    currentUserPermission: Optional[str] = None
    findings: List[Finding] = []
    versions: List[ContractVersion] = []
    shares: List[ContractShare] = []
    # Template Feature fields
    isTemplateBased: Optional[bool] = False
    templateSimilarity: Optional[float] = None
    sectionPairsJson: Optional[List[dict]] = None  # Debug: agreement↔template section mapping


    
    class Config:
        from_attributes = True

# Dashboard Stats
class ContractStatusCount(BaseModel):
    status: ContractStatus
    count: int

class DashboardStats(BaseModel):
    totalContracts: int
    inReview: int
    pendingApproval: int
    recentContracts: List[Agreement]
    contractsByStatus: List[ContractStatusCount]


# ── Platform Comments ─────────────────────────────────────────────────────────

class CommentReplyCreate(BaseModel):
    text: str

class CommentReplyOut(BaseModel):
    id: str
    commentId: str
    authorId: str
    authorName: str
    text: str
    createdAt: datetime

    class Config:
        from_attributes = True

class PlatformCommentCreate(BaseModel):
    versionId: Optional[str] = None
    quote: Optional[str] = None
    paragraphIndex: Optional[int] = None
    offsetStart: Optional[int] = None
    offsetEnd: Optional[int] = None
    text: str

class PlatformCommentOut(BaseModel):
    id: str
    agreementId: str
    versionId: Optional[str] = None
    versionName: Optional[str] = None
    authorId: str
    authorName: str
    quote: Optional[str] = None
    paragraphIndex: Optional[int] = None
    offsetStart: Optional[int] = None
    offsetEnd: Optional[int] = None
    text: str
    resolved: bool
    createdAt: datetime
    replies: List[CommentReplyOut] = []

    class Config:
        from_attributes = True
