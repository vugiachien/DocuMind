"""
Centralized error handlers for FastAPI.
Converts exceptions to standardized API responses.
"""
import logging
from typing import Union

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.services.exceptions import (
    BaseAppException,
    ErrorCode,
    ValidationError,
)

logger = logging.getLogger(__name__)


def register_error_handlers(app: FastAPI) -> None:
    """Register all error handlers with the FastAPI app."""
    
    @app.exception_handler(BaseAppException)
    async def app_exception_handler(request: Request, exc: BaseAppException) -> JSONResponse:
        """Handle custom application exceptions."""
        logger.warning(
            f"Application error: {exc.error_code.value} - {exc.detail}",
            extra={
                "path": request.url.path,
                "method": request.method,
                "error_code": exc.error_code.value,
                "extra": exc.extra,
            }
        )
        return JSONResponse(
            status_code=exc.status_code,
            content=exc.to_dict(),
        )
    
    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(
        request: Request, 
        exc: StarletteHTTPException
    ) -> JSONResponse:
        """Handle standard HTTP exceptions."""
        # Map status codes to error codes
        error_code_map = {
            400: ErrorCode.VALIDATION_ERROR,
            401: ErrorCode.UNAUTHORIZED,
            403: ErrorCode.FORBIDDEN,
            404: ErrorCode.NOT_FOUND,
            409: ErrorCode.ALREADY_EXISTS,
            500: ErrorCode.PROCESSING_FAILED,
        }
        
        error_code = error_code_map.get(exc.status_code, ErrorCode.PROCESSING_FAILED)
        
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": True,
                "code": error_code.value,
                "message": exc.detail,
            },
        )
    
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, 
        exc: RequestValidationError
    ) -> JSONResponse:
        """Handle Pydantic validation errors."""
        # Format validation errors nicely
        errors = {}
        for error in exc.errors():
            # Safely convert location to string (may contain bytes)
            field_parts = []
            for loc in error["loc"][1:]:  # Skip 'body'
                if isinstance(loc, bytes):
                    field_parts.append(loc.decode('utf-8', errors='replace'))
                else:
                    field_parts.append(str(loc))
            field = ".".join(field_parts) if field_parts else "unknown"
            errors[field] = error["msg"]
        
        logger.warning(
            f"Validation error on {request.url.path}",
            extra={"errors": errors}
        )
        
        return JSONResponse(
            status_code=422,
            content={
                "error": True,
                "code": ErrorCode.VALIDATION_ERROR.value,
                "message": "Validation error",
                "details": {
                    "validation_errors": errors,
                },
            },
        )
    
    @app.exception_handler(Exception)
    async def general_exception_handler(
        request: Request, 
        exc: Exception
    ) -> JSONResponse:
        """Handle unexpected exceptions."""
        # Log the full exception for debugging
        logger.exception(
            f"Unexpected error on {request.method} {request.url.path}",
            exc_info=exc,
        )
        
        # In production, don't expose internal error details
        from app.core.config import get_settings
        settings = get_settings()
        
        message = "An unexpected error occurred"
        details = None
        
        if settings.DEBUG:
            message = str(exc)
            details = {
                "exception_type": type(exc).__name__,
                "traceback": str(exc.__traceback__),
            }
        
        return JSONResponse(
            status_code=500,
            content={
                "error": True,
                "code": ErrorCode.PROCESSING_FAILED.value,
                "message": message,
                "details": details,
            },
        )
