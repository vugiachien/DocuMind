"""
Input validation utilities for file uploads and other data.
Centralizes validation logic for security and consistency.
"""
from fastapi import HTTPException, UploadFile
from pathlib import Path
from typing import Tuple, List, Optional
import logging

logger = logging.getLogger(__name__)


# Allowed MIME types for agreement files
ALLOWED_MIME_TYPES = {
    # PDF
    "application/pdf": [".pdf"],
    # DOCX
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    # DOCX sometimes detected as ZIP
    "application/zip": [".docx"],
    # Legacy DOC (optional)
    "application/msword": [".doc"],
    # Generic binary fallback for unrecognized files
    "application/octet-stream": [".pdf", ".docx", ".doc"],
}

# Allowed MIME types for audit_policy files (includes TXT)
PLAYBOOK_MIME_TYPES = {
    **ALLOWED_MIME_TYPES,
    "text/plain": [".txt"],
}
PLAYBOOK_MIME_TYPES["application/octet-stream"] = [".pdf", ".docx", ".doc", ".txt"]


def validate_file_upload(
    file: UploadFile,
    max_size_mb: int = 50,
    allowed_types: dict = None,
    require_extension: bool = True
) -> Tuple[int, str]:
    """
    Validate uploaded file for size, type, and extension.
    
    Args:
        file: FastAPI UploadFile object
        max_size_mb: Maximum file size in megabytes
        allowed_types: Dict of allowed MIME types to extensions
        require_extension: Whether to validate file extension matches MIME type
    
    Returns:
        Tuple of (file_size_bytes, detected_content_type)
    
    Raises:
        HTTPException: If validation fails
    """
    if allowed_types is None:
        allowed_types = ALLOWED_MIME_TYPES
    
    max_size_bytes = max_size_mb * 1024 * 1024
    
    # 1. Check filename exists
    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="Filename is required"
        )
    
    # 2. Check file size
    file.file.seek(0, 2)  # Seek to end
    file_size = file.file.tell()
    file.file.seek(0)  # Reset to beginning
    
    if file_size > max_size_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is {max_size_mb}MB. Got {file_size / (1024*1024):.1f}MB"
        )
    
    if file_size == 0:
        raise HTTPException(
            status_code=400,
            detail="File is empty"
        )
    
    # 3. Detect MIME type using magic bytes
    try:
        import magic
        mime = magic.Magic(mime=True)
        header = file.file.read(2048)
        content_type = mime.from_buffer(header)
        file.file.seek(0)
    except ImportError:
        logger.warning("python-magic not installed, skipping MIME validation")
        content_type = file.content_type or "application/octet-stream"
    except Exception as e:
        logger.error(f"MIME detection failed: {e}")
        content_type = file.content_type or "application/octet-stream"
    
    # 4. Validate MIME type
    if content_type not in allowed_types:
        allowed_list = ", ".join(allowed_types.keys())
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {content_type}. Allowed types: {allowed_list}"
        )
    
    # 5. Validate extension matches MIME type
    if require_extension:
        ext = Path(file.filename).suffix.lower()
        allowed_extensions = allowed_types.get(content_type, [])
        
        if ext not in allowed_extensions:
            # Special case: ZIP can be DOCX
            if content_type == "application/zip" and ext == ".docx":
                pass  # Allow
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"File extension '{ext}' does not match content type '{content_type}'"
                )
    
    logger.info(f"✅ File validated: {file.filename} ({file_size} bytes, {content_type})")
    return file_size, content_type


def validate_contract_file(file: UploadFile, max_size_mb: int = 50) -> Tuple[int, str]:
    """
    Validate a agreement file upload (PDF or DOCX only).
    
    Args:
        file: FastAPI UploadFile object
        max_size_mb: Maximum file size in megabytes
    
    Returns:
        Tuple of (file_size_bytes, detected_content_type)
    """
    return validate_file_upload(
        file,
        max_size_mb=max_size_mb,
        allowed_types=ALLOWED_MIME_TYPES
    )


def validate_playbook_file(file: UploadFile, max_size_mb: int = 50) -> Tuple[int, str]:
    """
    Validate a audit_policy file upload (PDF, DOCX, or TXT).
    
    Args:
        file: FastAPI UploadFile object
        max_size_mb: Maximum file size in megabytes
    
    Returns:
        Tuple of (file_size_bytes, detected_content_type)
    """
    return validate_file_upload(
        file,
        max_size_mb=max_size_mb,
        allowed_types=PLAYBOOK_MIME_TYPES
    )


def sanitize_filename(filename: str) -> str:
    """
    Sanitize filename to prevent path traversal and other attacks.
    
    Args:
        filename: Original filename
    
    Returns:
        Sanitized filename
    """
    import re
    import unicodedata
    
    # Normalize unicode characters
    filename = unicodedata.normalize('NFKD', filename)
    
    # Remove path separators
    filename = filename.replace('/', '_').replace('\\', '_')
    
    # Remove null bytes and other control characters
    filename = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', filename)
    
    # Remove leading/trailing dots and spaces
    filename = filename.strip('. ')
    
    # Limit length
    max_length = 255
    if len(filename) > max_length:
        name, ext = Path(filename).stem, Path(filename).suffix
        filename = name[:max_length - len(ext)] + ext
    
    # Default if empty
    if not filename:
        filename = "unnamed_file"
    
    return filename
