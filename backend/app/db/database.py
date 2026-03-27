from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@localhost:5434/contract_db")

# ✅ Optimized Connection Pool Config
# - pool_size: Number of permanent connections (default: 5 → 20)
# - max_overflow: Extra connections when pool exhausted (default: 10 → 10)
# - pool_pre_ping: Health check before using connection (prevents stale connections)
# - pool_recycle: Recycle connections after 1 hour (prevent timeout issues)
# - echo: Set to False for production (True for debugging SQL)
from sqlalchemy.pool import QueuePool

engine = create_engine(
    DATABASE_URL,
    poolclass=QueuePool,
    pool_size=20,           # Increase from default 5
    max_overflow=10,        # Allow 10 extra connections during peak
    pool_pre_ping=True,     # Test connection health before use
    pool_recycle=3600,      # Recycle connections after 1 hour
    echo=False              # Disable SQL logging for performance
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
