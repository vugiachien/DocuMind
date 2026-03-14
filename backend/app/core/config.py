"""
Centralized application configuration.
Uses pydantic-settings for environment variable validation.
"""
import os
from typing import List, Optional
from functools import lru_cache


class Settings:
    """
    Application settings loaded from environment variables.
    
    Usage:
        from app.core.config import get_settings
        settings = get_settings()
        print(settings.DATABASE_URL)
    """
    
    def __init__(self):
        # Environment
        self.ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
        self.DEBUG: bool = os.getenv("DEBUG", "true").lower() == "true"
        
        # Database
        self.DATABASE_URL: str = os.getenv(
            "DATABASE_URL", 
            "postgresql://user:password@localhost:5434/contract_db"
        )
        
        # JWT Security
        self.SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
        self.JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
        self.ACCESS_TOKEN_EXPIRE_HOURS: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_HOURS", "24"))
        
        # MinIO Storage
        self.MINIO_ENDPOINT: str = os.getenv("MINIO_ENDPOINT", "localhost:9002")
        self.MINIO_ACCESS_KEY: str = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
        self.MINIO_SECRET_KEY: str = os.getenv("MINIO_SECRET_KEY", "minioadmin")
        self.MINIO_BUCKET: str = os.getenv("MINIO_BUCKET", "agreements")
        self.MINIO_LIBRARY_BUCKET: str = os.getenv("MINIO_LIBRARY_BUCKET", "library")
        self.MINIO_SECURE: bool = os.getenv("MINIO_SECURE", "false").lower() == "true"
        
        # AI Service
        self.EXTERNAL_AI_API_URL: str = os.getenv("EXTERNAL_AI_API_URL", "http://localhost:8009")
        self.EXTERNAL_AI_API_KEY: str = os.getenv("EXTERNAL_AI_API_KEY", "")
        
        # Redis
        self.REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6390/0")
        
        # OpenAI — Use CLOUD keys
        _cloud_key = os.getenv("OPENAI_API_KEY_CLOUD", "").strip()
        self.OPENAI_API_KEY: str = _cloud_key
        self.OPENAI_API_BASE: Optional[str] = os.getenv("OPENAI_API_BASE_CLOUD")
        self.OPENAI_MODEL: str = os.getenv("OPENAI_MODEL_CLOUD", "gpt-4o-mini")
        
        # Keep fallback credentials for runtime retry (matches primary now)
        self.OPENAI_API_KEY_CLOUD: str = _cloud_key
        self.OPENAI_API_BASE_CLOUD: Optional[str] = self.OPENAI_API_BASE
        
        # File Upload Limits
        self.MAX_FILE_SIZE_MB: int = int(os.getenv("MAX_FILE_SIZE_MB", "50"))
        self.ALLOWED_FILE_TYPES: List[str] = ["application/pdf", 
                                               "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
        
        # CORS Settings
        self.FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")
        
        # Validate critical settings in production
        self._validate()
    
    def _validate(self):
        """Validate critical settings based on environment."""
        import warnings
        
        if self.ENVIRONMENT == "production":
            # Critical security checks for production
            if self.SECRET_KEY == "your-secret-key-change-in-production":
                raise ValueError(
                    "CRITICAL SECURITY FINDING: You must set SECRET_KEY environment variable in production!"
                )
            
            if not self.OPENAI_API_KEY:
                warnings.warn("WARNING: OPENAI_API_KEY not set. AI features will be limited.")
            
            if self.DEBUG:
                warnings.warn("WARNING: DEBUG mode is enabled in production!")
        else:
            # Development warnings
            if self.SECRET_KEY == "your-secret-key-change-in-production":
                warnings.warn(
                    "SECURITY WARNING: Using default SECRET_KEY. "
                    "Set SECRET_KEY env var for production."
                )
    
    @property
    def cors_origins(self) -> List[str]:
        """
        Get allowed CORS origins based on environment.
        
        Production: Only allow specific frontend URL
        Development: Allow localhost + all network interfaces
        """
        import socket
        
        # Get all local IPs for network access
        network_origins = []
        try:
            hostname = socket.gethostname()
            host_ips = socket.getaddrinfo(hostname, None, socket.AF_INET)
            for ip in host_ips:
                network_origins.append(f"http://{ip[4][0]}:5173")
                network_origins.append(f"http://{ip[4][0]}:3000")
        except:
            pass
        
        if self.ENVIRONMENT == "production":
            # Production: strict origins only
            origins = [self.FRONTEND_URL]
            
            # Allow additional origins from env if specified
            extra_origins = os.getenv("CORS_ALLOWED_ORIGINS", "")
            if extra_origins:
                origins.extend([o.strip() for o in extra_origins.split(",") if o.strip()])
            
            return origins
        else:
            # Development: allow localhost + all network interfaces + wildcard for simplicity
            return ["*"]
    
    @property
    def max_file_size_bytes(self) -> int:
        """Get max file size in bytes."""
        return self.MAX_FILE_SIZE_MB * 1024 * 1024
    
    def is_production(self) -> bool:
        """Check if running in production environment."""
        return self.ENVIRONMENT == "production"
    
    def is_development(self) -> bool:
        """Check if running in development environment."""
        return self.ENVIRONMENT in ("development", "dev", "local")


# Singleton instance with caching
_settings: Optional[Settings] = None


def get_settings() -> Settings:
    """
    Get the application settings singleton.
    
    Returns:
        Settings instance
    """
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


# For backward compatibility and easy imports
settings = get_settings()
