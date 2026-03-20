from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import logging

# Load environment variables FIRST (before importing app modules)
load_dotenv()

# Import config after loading env vars
from app.core.config import get_settings
from app.core.color_logger import setup_color_logging

# Get settings instance
settings = get_settings()

# Configure logging
setup_color_logging(logging.DEBUG if settings.DEBUG else logging.INFO)
logger = logging.getLogger("api_logger")

# Log environment info on startup
logger.info(f"🚀 Starting Smart Agreement API in {settings.ENVIRONMENT} mode")

app = FastAPI(
    title="Smart Agreement API",
    description="""
    Backend API for Smart Agreement Review System.
    
    Features:
    - Agreement Management (CRUD)
    - File Upload & Processing (MinIO)
    - Integration with AI Service for Finding Analysis
    - Finding & Recommendation Management
    """,
    version="0.1.0",
    # Disable docs in production for security (optional)
    docs_url="/docs" if not settings.is_production() else None,
    redoc_url="/redoc" if not settings.is_production() else None,
)

# Configure CORS - Use settings-based origins (no wildcard in production!)
logger.info(f"🔒 CORS Origins: {settings.cors_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
)

# Logging Middleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Log Request (skip health checks to reduce noise)
        if request.url.path != "/health":
            logger.info(f"📨 Incoming Request: {request.method} {request.url}")
        
        # Call next middleware/endpoint
        response = await call_next(request)
        
        # Log Response Status
        if request.url.path != "/health":
            logger.info(f"📤 Response Status: {response.status_code}")
        
        return response

app.add_middleware(LoggingMiddleware)

# Rate Limiting
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from app.core.rate_limiter import limiter

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Register custom error handlers
from app.core.error_handlers import register_error_handlers
register_error_handlers(app)

# Import and register API routers
from app.api.endpoints import audit_policies, agreements, auth, users, departments, notifications

app.include_router(audit_policies.router, prefix="/api/v1/audit_policies", tags=["audit_policies"])
app.include_router(agreements.router, prefix="/api/v1/agreements", tags=["agreements"])
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/v1/users", tags=["users"])
app.include_router(departments.router, prefix="/api/v1/departments", tags=["departments"])
app.include_router(notifications.router, prefix="/api/v1/notifications", tags=["notifications"])


@app.get("/")
def read_root():
    """Root endpoint with API info."""
    return {
        "message": "Welcome to Smart Agreement API", 
        "status": "running",
        "version": "0.1.0",
        "environment": settings.ENVIRONMENT,
        "docs": "/docs" if not settings.is_production() else "disabled"
    }

@app.get("/health")
def health_check():
    """Health check endpoint for load balancers and monitoring."""
    return {
        "status": "ok",
        "environment": settings.ENVIRONMENT
    }


# Startup event
@app.on_event("startup")
async def startup_event():
    """Application startup tasks."""
    logger.info("=" * 50)
    logger.info(f"🚀 Smart Agreement API Starting...")
    logger.info(f"   Environment: {settings.ENVIRONMENT}")
    logger.info(f"   Debug Mode: {settings.DEBUG}")
    logger.info(f"   Database URL: {settings.DATABASE_URL.split('@')[-1]}") # Log safe part of URL
    logger.info(f"   CORS Origins: {len(settings.cors_origins)} configured")
    logger.info("=" * 50)
    
    from app.db.init_db import init_db
    init_db()


# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    """Application shutdown tasks."""
    logger.info("👋 Smart Agreement API shutting down...")
