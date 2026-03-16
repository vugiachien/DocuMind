"""
Custom exceptions for the Agreement Review System.
Centralized error handling with structured error codes and messages.
"""
from typing import Any, Dict, List, Optional
from enum import Enum


class ErrorCode(str, Enum):
    """Standardized error codes for API responses."""
    # Authentication & Authorization (1xxx)
    UNAUTHORIZED = "AUTH_001"
    INVALID_TOKEN = "AUTH_002"
    TOKEN_EXPIRED = "AUTH_003"
    FORBIDDEN = "AUTH_004"
    INVALID_CREDENTIALS = "AUTH_005"
    
    # Resource Errors (2xxx)
    NOT_FOUND = "RES_001"
    ALREADY_EXISTS = "RES_002"
    DELETED = "RES_003"
    VERSION_CONFLICT = "RES_004"
    
    # Validation Errors (3xxx)
    VALIDATION_ERROR = "VAL_001"
    INVALID_FILE_TYPE = "VAL_002"
    FILE_TOO_LARGE = "VAL_003"
    INVALID_INPUT = "VAL_004"
    MISSING_REQUIRED_FIELD = "VAL_005"
    
    # Processing Errors (4xxx)
    PROCESSING_FAILED = "PROC_001"
    AI_ANALYSIS_FAILED = "PROC_002"
    FILE_CONVERSION_FAILED = "PROC_003"
    TEXT_REPLACEMENT_FAILED = "PROC_004"
    DOCUMENT_PARSE_FAILED = "PROC_005"
    
    # External Service Errors (5xxx)
    EXTERNAL_SERVICE_ERROR = "EXT_001"
    MINIO_ERROR = "EXT_002"
    AI_SERVICE_ERROR = "EXT_003"
    DATABASE_ERROR = "EXT_004"
    
    # Business Logic Errors (6xxx)
    PERMISSION_DENIED = "BIZ_001"
    INVALID_STATE_TRANSITION = "BIZ_002"
    CONTRACT_LOCKED = "BIZ_003"
    SHARE_NOT_ALLOWED = "BIZ_004"


class BaseAppException(Exception):
    """
    Base exception class for all application exceptions.
    Provides structured error information for API responses.
    """
    status_code: int = 500
    error_code: ErrorCode = ErrorCode.PROCESSING_FAILED
    detail: str = "An unexpected error occurred"
    
    def __init__(
        self,
        detail: Optional[str] = None,
        error_code: Optional[ErrorCode] = None,
        status_code: Optional[int] = None,
        extra: Optional[Dict[str, Any]] = None,
    ):
        self.detail = detail or self.detail
        self.error_code = error_code or self.error_code
        self.status_code = status_code or self.status_code
        self.extra = extra or {}
        super().__init__(self.detail)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert exception to API response format."""
        response = {
            "error": True,
            "code": self.error_code.value,
            "message": self.detail,
        }
        if self.extra:
            response["details"] = self.extra
        return response


# =============================================================================
# Authentication & Authorization Exceptions
# =============================================================================

class AuthenticationError(BaseAppException):
    """Raised when authentication fails."""
    status_code = 401
    error_code = ErrorCode.UNAUTHORIZED
    detail = "Authentication required"


class InvalidTokenError(AuthenticationError):
    """Raised when token is invalid."""
    error_code = ErrorCode.INVALID_TOKEN
    detail = "Invalid authentication token"


class TokenExpiredError(AuthenticationError):
    """Raised when token has expired."""
    error_code = ErrorCode.TOKEN_EXPIRED
    detail = "Authentication token has expired"


class PermissionDeniedError(BaseAppException):
    """Raised when user doesn't have required permissions."""
    status_code = 403
    error_code = ErrorCode.PERMISSION_DENIED
    detail = "You don't have permission to perform this action"


# =============================================================================
# Resource Exceptions
# =============================================================================

class NotFoundError(BaseAppException):
    """Raised when a resource is not found."""
    status_code = 404
    error_code = ErrorCode.NOT_FOUND
    detail = "Resource not found"
    
    def __init__(self, resource_type: str, resource_id: str = None, **kwargs):
        detail = f"{resource_type} not found"
        if resource_id:
            detail = f"{resource_type} with ID '{resource_id}' not found"
        super().__init__(detail=detail, **kwargs)
        self.extra["resource_type"] = resource_type
        if resource_id:
            self.extra["resource_id"] = resource_id


class ContractNotFoundError(NotFoundError):
    """Raised when a agreement is not found."""
    def __init__(self, contract_id: str):
        super().__init__(resource_type="Agreement", resource_id=contract_id)


class VersionConflictError(BaseAppException):
    """Raised when there's a version conflict (optimistic locking)."""
    status_code = 409
    error_code = ErrorCode.VERSION_CONFLICT
    detail = "Resource has been modified by another user"


class AlreadyExistsError(BaseAppException):
    """Raised when trying to create a resource that already exists."""
    status_code = 409
    error_code = ErrorCode.ALREADY_EXISTS
    detail = "Resource already exists"


class ResourceDeletedError(BaseAppException):
    """Raised when trying to access a soft-deleted resource."""
    status_code = 410
    error_code = ErrorCode.DELETED
    detail = "Resource has been deleted"


# =============================================================================
# Validation Exceptions
# =============================================================================

class ValidationError(BaseAppException):
    """Raised when input validation fails."""
    status_code = 400
    error_code = ErrorCode.VALIDATION_ERROR
    detail = "Validation error"
    
    def __init__(self, errors: Dict[str, str] = None, **kwargs):
        super().__init__(**kwargs)
        if errors:
            self.extra["validation_errors"] = errors


class InvalidFileTypeError(ValidationError):
    """Raised when file type is not allowed."""
    error_code = ErrorCode.INVALID_FILE_TYPE
    
    def __init__(self, received_type: str, allowed_types: List[str]):
        detail = f"Invalid file type: {received_type}. Allowed: {', '.join(allowed_types)}"
        super().__init__(
            detail=detail,
            extra={"received_type": received_type, "allowed_types": allowed_types}
        )


class FileTooLargeError(ValidationError):
    """Raised when file exceeds size limit."""
    error_code = ErrorCode.FILE_TOO_LARGE
    
    def __init__(self, file_size_mb: float, max_size_mb: float):
        detail = f"File too large: {file_size_mb:.1f}MB. Maximum allowed: {max_size_mb}MB"
        super().__init__(
            detail=detail,
            extra={"file_size_mb": file_size_mb, "max_size_mb": max_size_mb}
        )


# =============================================================================
# Processing Exceptions
# =============================================================================

class ProcessingError(BaseAppException):
    """Base class for processing errors."""
    status_code = 500
    error_code = ErrorCode.PROCESSING_FAILED
    detail = "Processing failed"


class TextReplacementError(ProcessingError):
    """Raised when document text replacement fails."""
    error_code = ErrorCode.TEXT_REPLACEMENT_FAILED
    
    def __init__(
        self, 
        reason: str, 
        target_text: str, 
        suggestions: List[str] = None
    ):
        self.reason = reason
        self.target_text = target_text
        self.suggestions = suggestions or []
        
        detail = f"Text replacement failed: {reason}"
        super().__init__(
            detail=detail,
            extra={
                "reason": reason,
                "target_text_preview": target_text[:100] + "..." if len(target_text) > 100 else target_text,
                "suggestions": [s[:50] for s in self.suggestions[:3]] if self.suggestions else []
            }
        )


class AIAnalysisError(ProcessingError):
    """Raised when AI analysis fails."""
    error_code = ErrorCode.AI_ANALYSIS_FAILED
    detail = "AI analysis failed"


class FileConversionError(ProcessingError):
    """Raised when file conversion fails."""
    error_code = ErrorCode.FILE_CONVERSION_FAILED
    detail = "File conversion failed"


class DocumentParseError(ProcessingError):
    """Raised when document parsing fails."""
    error_code = ErrorCode.DOCUMENT_PARSE_FAILED
    detail = "Failed to parse document"


# =============================================================================
# External Service Exceptions
# =============================================================================

class ExternalServiceError(BaseAppException):
    """Raised when an external service fails."""
    status_code = 502
    error_code = ErrorCode.EXTERNAL_SERVICE_ERROR
    detail = "External service error"


class StorageServiceError(ExternalServiceError):
    """Raised when MinIO/storage service fails."""
    error_code = ErrorCode.MINIO_ERROR
    detail = "Storage service error"


class AIServiceError(ExternalServiceError):
    """Raised when AI service fails."""
    error_code = ErrorCode.AI_SERVICE_ERROR
    detail = "AI service error"


# =============================================================================
# Business Logic Exceptions
# =============================================================================

class InvalidStateTransitionError(BaseAppException):
    """Raised when an invalid state transition is attempted."""
    status_code = 400
    error_code = ErrorCode.INVALID_STATE_TRANSITION
    
    def __init__(self, current_state: str, requested_state: str, allowed_states: List[str] = None):
        detail = f"Cannot transition from '{current_state}' to '{requested_state}'"
        if allowed_states:
            detail += f". Allowed transitions: {', '.join(allowed_states)}"
        super().__init__(
            detail=detail,
            extra={
                "current_state": current_state,
                "requested_state": requested_state,
                "allowed_states": allowed_states or []
            }
        )


class ContractLockedError(BaseAppException):
    """Raised when trying to modify a locked agreement."""
    status_code = 423
    error_code = ErrorCode.CONTRACT_LOCKED
    detail = "Agreement is locked and cannot be modified"
