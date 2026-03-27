from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float, Boolean, Enum, JSON, Text, Index
from sqlalchemy.orm import relationship, declared_attr
from sqlalchemy.ext.declarative import declared_attr
import uuid
from datetime import datetime
from .database import Base


class SoftDeleteMixin:
    """
    Mixin for soft delete functionality.
    Add to models that should support soft delete instead of hard delete.
    """
    @declared_attr
    def deleted_at(cls):
        return Column(DateTime, nullable=True, index=True)
    
    @declared_attr  
    def deleted_by(cls):
        return Column(String, nullable=True)
    
    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None
    
    def soft_delete(self, deleted_by_user_id: str = None):
        """Mark this record as deleted."""
        self.deleted_at = datetime.utcnow()
        self.deleted_by = deleted_by_user_id
    
    def restore(self):
        """Restore a soft-deleted record."""
        self.deleted_at = None
        self.deleted_by = None


class Department(Base):
    __tablename__ = "departments"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, unique=True, nullable=False)
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    users = relationship("User", back_populates="department")

class User(Base):
    __tablename__ = "users"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String)
    role = Column(String, default="user")  # "admin" or "user"
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    departmentId = Column(String, ForeignKey("departments.id"), nullable=True)
    avatar_url = Column(String, nullable=True)  # URL to avatar image in MinIO
    password_changed_at = Column(DateTime, nullable=True)  # for JWT invalidation on password change

    # Relationships
    department = relationship("Department", back_populates="users")
    agreements = relationship("Agreement", back_populates="owner")

class Partner(Base):
    __tablename__ = "partners"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, index=True)
    taxCode = Column(String)
    representative = Column(String)
    address = Column(String)
    email = Column(String)
    
    agreements = relationship("Agreement", back_populates="partner")

class ContractType(Base):
    __tablename__ = "contract_types"

    id = Column(String, primary_key=True, index=True)
    code = Column(String, unique=True, index=True)
    name = Column(String)
    description = Column(String)
    # Template DOCX file for this agreement type (MinIO path)
    templateUrl = Column(String, nullable=True)
    htmlPreview = Column("htmlpreview", Text, nullable=True) # HTML render of template
    
    agreements = relationship("Agreement", back_populates="contract_type")

class Agreement(SoftDeleteMixin, Base):
    __tablename__ = "agreements"
    
    # Composite indexes for common query patterns
    __table_args__ = (
        Index('ix_contracts_owner_status', 'ownerId', 'status'),  # Filter by owner + status
        Index('ix_contracts_status_updated', 'status', 'updatedAt'),  # Sort by updated within status
        Index('ix_contracts_not_deleted', 'deleted_at'),  # Filter out deleted records
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    contractNumber = Column(String, unique=True, index=True)
    name = Column(String)
    
    partnerId = Column(String, ForeignKey("partners.id"), index=True)
    agreementTypeId = Column(String, ForeignKey("contract_types.id"), index=True)
    auditPolicyId = Column(String, ForeignKey("audit_policies.id"), nullable=True, index=True)
    ownerId = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    
    status = Column(String, default="draft", index=True)  # Frequently filtered
    value = Column(Float)
    effectiveDate = Column(DateTime)
    expiryDate = Column(DateTime)
    
    createdBy = Column(String)
    createdAt = Column(DateTime, default=datetime.utcnow, index=True)  # For sorting
    updatedAt = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, index=True)
    currentVersion = Column(String, default="v1.0")
    fileUrl = Column(String, nullable=True)
    
    # --- Template Feature ---
    # True when the uploaded file was matched to the ContractType template (similarity >= threshold)
    isTemplateBased = Column(Boolean, default=False)
    # TF-IDF cosine similarity score (0.0–1.0) between template and uploaded file
    templateSimilarity = Column(Float, nullable=True)
    # Debug: JSON array of {contract_section, template_section, match_strategy} pairs
    sectionPairsJson = Column(JSON, nullable=True)


    
    partner = relationship("Partner", back_populates="agreements")
    contract_type = relationship("ContractType", back_populates="agreements")
    owner = relationship("User", back_populates="agreements")
    audit_policy = relationship("AuditPolicy")  # NEW: Relationship to AuditPolicy
    findings = relationship("Finding", back_populates="agreement", cascade="all, delete-orphan")
    versions = relationship("ContractVersion", back_populates="agreement", cascade="all, delete-orphan")

    @property
    def partnerName(self):
        return self.partner.name if self.partner else None

    @property
    def contractTypeName(self):
        return self.contract_type.name if self.contract_type else None

    # Relationship for shares
    shares = relationship("ContractShare", back_populates="agreement", cascade="all, delete-orphan")

class ContractShare(Base):
    __tablename__ = "contract_shares"
    
    # Index for permission lookups: finding all agreements shared with a user/department
    __table_args__ = (
        Index('ix_contract_shares_target', 'sharedType', 'targetId'),
        Index('ix_contract_shares_contract', 'agreementId'),
    )
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    agreementId = Column(String, ForeignKey("agreements.id"))
    sharedType = Column(String)  # 'user' or 'department'
    targetId = Column(String)  # userId or departmentId
    permission = Column(String, default="view")  # view, edit
    sharedAt = Column(DateTime, default=datetime.utcnow)
    sharedBy = Column(String, ForeignKey("users.id"))

    agreement = relationship("Agreement", back_populates="shares")
    sharer = relationship("User")

class Finding(Base):
    __tablename__ = "findings"
    
    # Index for finding queries
    __table_args__ = (
        Index('ix_risks_contract_severity', 'agreementId', 'severity'),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    agreementId = Column(String, ForeignKey("agreements.id"), index=True)
    description = Column(Text)
    severity = Column(String, index=True)  # high, medium, low - frequently filtered
    page = Column(Integer)
    section_index = Column(Integer, default=0) # Order of appearance in the document
    section = Column(String, nullable=True)
    term = Column(String, nullable=True)
    quote = Column(Text, nullable=True)
    recommendation = Column(Text, nullable=True)
    original_text = Column(Text, nullable=True)  # Original text from agreement
    suggested_text = Column(Text, nullable=True)  # AI suggested replacement text
    auto_fixable = Column(Boolean, default=True)  # Whether suggested_text can be auto-applied
    action_meta = Column(JSON, nullable=True)  # Store action info (MODIFY/INSERT) from AI
    risk_type = Column(String, default="modification", index=True)  # "modification" | "recommendation"
    risk_source = Column(String, default="audit_policy", index=True)  # "audit_policy" | "template"
    confidence_score = Column(Integer, nullable=True)  # 0-100: AI confidence in this finding

    agreement = relationship("Agreement", back_populates="findings")

class AuditPolicy(Base):
    __tablename__ = "audit_policies"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, index=True)
    description = Column(String, nullable=True)
    fileUrl = Column(String)
    uploadedAt = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default='active', index=True)  # Frequently filtered
    createdBy = Column(String, nullable=True)
    agreementTypeId = Column(String, ForeignKey("contract_types.id"), nullable=True, index=True)
    # 'audit_policy' or 'severity_rule' - used to distinguish document types in the Library
    type = Column(String, default='audit_policy', nullable=False, index=True)

    contract_type = relationship("ContractType")
    rules = relationship("PlaybookRule", back_populates="audit_policy", cascade="all, delete-orphan")

class PlaybookRule(Base):
    __tablename__ = "playbook_rules"
    
    # Index for rule lookups by audit_policy
    __table_args__ = (
        Index('ix_playbook_rules_playbook_severity', 'auditPolicyId', 'severity'),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    auditPolicyId = Column(String, ForeignKey("audit_policies.id"), index=True)
    category = Column(String, index=True)
    name = Column(String)
    description = Column(Text)
    standardClause = Column(Text)
    severity = Column(String, index=True)  # high, medium, low
    clauseRef = Column(String, nullable=True)           # e.g. "1.12", "2.5", "Opt. 1/Clause 4.1"
    acceptableDeviation = Column(Text, nullable=True)   # what deviations are allowed
    approvalLevel = Column(String, nullable=True)        # e.g. "BOD", "FNC/LEG", "LEG"

    audit_policy = relationship("AuditPolicy", back_populates="rules")

class ContractVersion(Base):
    __tablename__ = "contract_versions"
    
    # Index for version lookups
    __table_args__ = (
        Index('ix_contract_versions_contract_version', 'agreementId', 'version'),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    agreementId = Column(String, ForeignKey("agreements.id"), index=True)
    version = Column(String)  # v0.0, v0.1, v1.0 etc.
    fileUrl = Column(String)  # MinIO path
    uploadedAt = Column(DateTime, default=datetime.utcnow, index=True)
    createdBy = Column(String, nullable=True)  # User who triggered versioning
    changes = Column(Text, nullable=True)  # Description of changes
    # Version origin type: 'template' | 'upload' | 'ai_fix' | 'manual_edit'
    versionType = Column(String, default='upload', nullable=True)
    
    # Analysis & Cache Columns
    extractedText = Column("extractedtext", Text, nullable=True)
    htmlPreview = Column("htmlpreview", Text, nullable=True)
    processingStatus = Column("processingstatus", String, default="pending", index=True)
    processingError = Column("processingerror", String, nullable=True)

    agreement = relationship("Agreement", back_populates="versions")

class AuditLog(Base):
    __tablename__ = "audit_logs"
    
    # Indexes for audit queries
    __table_args__ = (
        Index('ix_audit_logs_target', 'targetType', 'targetId'),  # Find all logs for an object
        Index('ix_audit_logs_user_time', 'userId', 'timestamp'),  # User activity timeline
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    userId = Column(String, ForeignKey("users.id"), index=True)
    action = Column(String, nullable=False, index=True)  # CREATE, UPDATE, DELETE, etc.
    targetType = Column(String, nullable=False, index=True)  # AGREEMENT, RULE, USER
    targetId = Column(String, nullable=False)  # ID of the target object
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)  # For time-based queries
    details = Column(JSON, nullable=True)

    user = relationship("User")

    @property
    def userName(self):
        return self.user.full_name if self.user and self.user.full_name else (self.user.username if self.user else "Unknown")

class ContractComment(Base):
    __tablename__ = "contract_comments"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    agreementId = Column(String, ForeignKey("agreements.id"), nullable=False, index=True)
    versionId = Column(String, ForeignKey("contract_versions.id"), nullable=True, index=True)
    authorId = Column(String, ForeignKey("users.id"), nullable=False)
    quote = Column(Text, nullable=True)       # selected text that the comment anchors to
    paragraph_index = Column(Integer, nullable=True)  # paragraph position in document
    offset_start = Column(Integer, nullable=True)     # char offset within paragraph
    offset_end = Column(Integer, nullable=True)       # char offset end within paragraph
    text = Column(Text, nullable=False)
    resolved = Column(Boolean, default=False)
    createdAt = Column(DateTime, default=datetime.utcnow, index=True)

    author = relationship("User")
    version = relationship("ContractVersion")
    replies = relationship("CommentReply", back_populates="comment", cascade="all, delete-orphan", order_by="CommentReply.createdAt")

    @property
    def authorName(self):
        return self.author.full_name or self.author.username if self.author else "Unknown"


class CommentReply(Base):
    __tablename__ = "comment_replies"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    commentId = Column(String, ForeignKey("contract_comments.id"), nullable=False, index=True)
    authorId = Column(String, ForeignKey("users.id"), nullable=False)
    text = Column(Text, nullable=False)
    createdAt = Column(DateTime, default=datetime.utcnow)

    author = relationship("User")
    comment = relationship("ContractComment", back_populates="replies")

    @property
    def authorName(self):
        return self.author.full_name or self.author.username if self.author else "Unknown"


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    userId = Column(String, ForeignKey("users.id"), index=True)
    title = Column(String, nullable=False)
    message = Column(String, nullable=False)
    type = Column(String, default="info") # info, success, warning, error
    isRead = Column(Boolean, default=False)
    createdAt = Column(DateTime, default=datetime.utcnow)
    link = Column(String, nullable=True) # Link to resource (e.g. /agreements/123)
    
    user = relationship("User", back_populates="notifications")

# Add relationship to User model
User.notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")

