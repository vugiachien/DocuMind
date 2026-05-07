"""
Application-wide constants and enums.
Centralizes magic numbers and string constants for maintainability.
"""
from enum import Enum
from typing import List
import os


# =============================================================================
# AGREEMENT STATUS
# =============================================================================
class ContractStatus:
    """Agreement lifecycle statuses."""
    DRAFT = "draft"
    CONVERTING = "converting"  # PDF being converted to DOCX
    PROCESSING = "processing"  # AI analysis in progress
    REVIEW = "review"          # Ready for review
    UPDATE = "update"          # Modified after review
    NEGOTIATION = "negotiation"
    MANAGER_REVIEW = "manager_review"
    APPROVAL = "approval"
    SIGNING = "signing"
    ACTIVE = "active"
    EXPIRED = "expired"
    TERMINATED = "terminated"
    ERROR = "error"
    
    @classmethod
    def all(cls) -> List[str]:
        return [
            cls.DRAFT, cls.CONVERTING, cls.PROCESSING, cls.REVIEW,
            cls.UPDATE, cls.NEGOTIATION, cls.MANAGER_REVIEW,
            cls.APPROVAL, cls.SIGNING, cls.ACTIVE, cls.EXPIRED,
            cls.TERMINATED, cls.ERROR
        ]


# =============================================================================
# FINDING LEVELS
# =============================================================================
class RiskLevel:
    """Finding severity levels."""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    
    @classmethod
    def all(cls) -> List[str]:
        return [cls.HIGH, cls.MEDIUM, cls.LOW]


class RiskType:
    """Finding types for different handling."""
    MODIFICATION = "modification"  # Can be auto-fixed
    RECOMMENDATION = "recommendation"  # Requires manual review
    
    @classmethod
    def all(cls) -> List[str]:
        return [cls.MODIFICATION, cls.RECOMMENDATION]


# =============================================================================
# USER ROLES & PERMISSIONS
# =============================================================================
class UserRole:
    """User roles for RBAC."""
    ADMIN = "admin"
    USER = "user"
    LEGAL = "legal"
    BUSINESS = "business"
    MANAGER = "manager"
    
    @classmethod
    def all(cls) -> List[str]:
        return [cls.ADMIN, cls.USER, cls.LEGAL, cls.BUSINESS, cls.MANAGER]


class Permission:
    """Permission levels for resources."""
    VIEW = "view"
    EDIT = "edit"
    ADMIN = "admin"
    OWNER = "owner"
    
    @classmethod
    def all(cls) -> List[str]:
        return [cls.VIEW, cls.EDIT, cls.ADMIN, cls.OWNER]


class ShareType:
    """Share target types."""
    USER = "user"
    DEPARTMENT = "department"


# =============================================================================
# AUDIT LOG ACTIONS
# =============================================================================
class AuditAction:
    """Audit log action types."""
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    VIEW = "VIEW"
    DOWNLOAD = "DOWNLOAD_FILE"
    UPLOAD = "UPLOAD_FILE"
    APPROVE = "APPROVE"
    REJECT = "REJECT"
    SHARE = "SHARE"
    REVOKE = "REVOKE"
    ANALYZE = "ANALYZE"
    RISK_APPLY = "RISK_BATCH_APPLY"
    CREATE_VERSION = "CREATE_VERSION"


class AuditTargetType:
    """Audit log target types."""
    AGREEMENT = "AGREEMENT"
    AUDIT_POLICY = "AUDIT_POLICY"
    RULE = "RULE"
    USER = "USER"
    DEPARTMENT = "DEPARTMENT"


# =============================================================================
# NOTIFICATION TYPES
# =============================================================================
class NotificationType:
    """Notification types."""
    INFO = "info"
    SUCCESS = "success"
    WARNING = "warning"
    ERROR = "error"


# =============================================================================
# AUDIT_POLICY STATUS
# =============================================================================
class PlaybookStatus:
    """AuditPolicy processing statuses."""
    PROCESSING = "processing"
    ACTIVE = "active"
    INACTIVE = "inactive"
    FAILED = "failed"


# =============================================================================
# VERSION PROCESSING STATUS
# =============================================================================
class ProcessingStatus:
    """Agreement version processing statuses."""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


# =============================================================================
# FILE PROCESSING
# =============================================================================
class FileConfig:
    """File upload and processing configuration."""
    MAX_SIZE_MB = 50
    MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024
    CHUNK_SIZE = 8192  # For streaming
    
    # Allowed extensions
    CONTRACT_EXTENSIONS = {".pdf", ".docx"}
    PLAYBOOK_EXTENSIONS = {".pdf", ".docx", ".txt"}


# =============================================================================
# AI PROCESSING
# =============================================================================
class AIConfig:
    """AI service configuration constants."""
    # Timeouts
    ANALYSIS_TIMEOUT_SECONDS = 300  # 5 minutes
    
    # Embedding
    DEFAULT_EMBEDDING_MODEL = "sentence-transformers/paraphrase-multilingual-mpnet-base-v2"
    EMBEDDING_DIMENSION = 768  # For the default model
    
    # Chunking
    MAX_TOKENS_PER_CHUNK = 400
    CHUNK_OVERLAP = 50
    
    # Search
    DEFAULT_TOP_K_RULES = 5
    MAX_TOP_K_RULES = 10
    
    # LLM
    DEFAULT_LLM_MODEL = os.getenv("OPENAI_MODEL", "gpt-5.2")
    LLM_TEMPERATURE = 0
    LLM_MAX_RETRIES = 3


# =============================================================================
# CELERY TASK CONFIGURATION
# =============================================================================
class TaskConfig:
    """Celery task configuration."""
    # Timeouts
    # Template-based analysis is especially expensive (2 docs + section matching + LLM).
    # Limits must accommodate worst-case analysis duration.
    HARD_TIME_LIMIT = 2700  # 45 minutes (hard kill)
    SOFT_TIME_LIMIT = 2640  # 44 minutes (graceful interrupt)
    
    # Per-call HTTP timeout used by ExternalAIClient
    AI_CALL_TIMEOUT = 1200  # 20 minutes per individual AI request
    
    # Retries
    MAX_RETRIES = 3
    RETRY_BACKOFF = True
    
    # Zombie cleanup
    ZOMBIE_THRESHOLD_MINUTES = 30  # bumped to match new max task duration


# =============================================================================
# API RATE LIMITS
# =============================================================================
class RateLimitConfig:
    """API rate limiting configuration."""
    DEFAULT_LIMIT = "100/minute"
    UPLOAD_LIMIT = "20/minute"
    ANALYZE_LIMIT = "20/minute"
    AUTH_LIMIT = "10/minute"


# =============================================================================
# PAGINATION
# =============================================================================
class PaginationConfig:
    """Pagination defaults."""
    DEFAULT_PAGE_SIZE = 20
    MAX_PAGE_SIZE = 100
    DEFAULT_PAGE = 1


# =============================================================================
# CACHE
# =============================================================================
class CacheConfig:
    """Cache configuration."""
    VERSION_FILE_CACHE_SECONDS = 86400  # 24 hours
    HTML_PREVIEW_CACHE_SECONDS = 3600   # 1 hour
