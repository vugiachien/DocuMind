import logging
import os
from sqlalchemy import create_engine, text
from app.db.database import DATABASE_URL
SQLALCHEMY_DATABASE_URL = DATABASE_URL

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def migrate():
    engine = create_engine(SQLALCHEMY_DATABASE_URL)
    with engine.connect() as conn:
        # 1. Create departments table if not exists (handled by SQL usually, but let's do it explicitly if alchemy didn't)
        # Actually simplest is to run create_all first to ensure new tables exist
        from app.db.database import Base
        from app.db.models import Department
        logger.info("Creating new tables...")
        Base.metadata.create_all(bind=engine)
        
        # 2. Add departmentId to users table if not exists
        logger.info("Checking for departmentId column in users table...")
        try:
            # Check if column exists (Postgres specific)
            result = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='departmentId'"))
            if result.rowcount == 0:
                logger.info("Adding departmentId column to users table...")
                conn.execute(text("ALTER TABLE users ADD COLUMN \"departmentId\" VARCHAR"))
                conn.execute(text("ALTER TABLE users ADD CONSTRAINT fk_user_department FOREIGN KEY (\"departmentId\") REFERENCES departments(id)"))
                conn.commit()
                logger.info("Column added successfully.")
            else:
                logger.info("Column departmentId already exists.")
        except Exception as e:
            logger.error(f"Error updating users table: {e}")
            # Try generic SQL if postgres check fails or we are on sqlite?
            # Assuming Postgres based on analysis
            
if __name__ == "__main__":
    migrate()
