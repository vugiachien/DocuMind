import os
import sys

# Add the 'backend' directory to sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
# backend_dir = os.path.dirname(current_dir) # If script is in backend/app, but it is in backend/
sys.path.append(current_dir)

from app.db.database import DATABASE_URL as SQLALCHEMY_DATABASE_URL
from sqlalchemy import create_engine, text

def migrate():
    # Construct database URL if needed (same as main app)
    # But using the imported one is better if PYTHONPATH is set correctly.
    # Let's try to usage the imported one, assuming run from backend root.
    
    engine = create_engine(SQLALCHEMY_DATABASE_URL)

    with engine.begin() as connection:
        print("Creating 'audit_logs' table...")
        try:
            connection.execute(text("""
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id VARCHAR PRIMARY KEY,
                    "userId" VARCHAR REFERENCES users(id),
                    action VARCHAR NOT NULL,
                    "targetType" VARCHAR NOT NULL,
                    "targetId" VARCHAR NOT NULL,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    details JSON
                );
            """))
            print("'audit_logs' table created successfully.")
            
            # Create index on targetId for faster lookup
            print("Creating index on targetId...")
            connection.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_audit_logs_target_id ON audit_logs ("targetId");
            """))
             # Create index on userId
            print("Creating index on userId...")
            connection.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs ("userId");
            """))
            
            print("Migration completed successfully.")
        except Exception as e:
            print(f"Migration failed: {e}")

if __name__ == "__main__":
    migrate()
