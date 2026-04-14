"""
Migration script to add avatar_url column to users table.
Run this script to apply the migration.
"""
import sys
import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@localhost:5434/contract_db")

def run_migration():
    """Add avatar_url column to users table."""
    engine = create_engine(DATABASE_URL)
    
    try:
        with engine.connect() as conn:
            # Check if column already exists
            check_query = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'users' AND column_name = 'avatar_url'
            """)
            result = conn.execute(check_query)
            if result.fetchone():
                print("✅ Column 'avatar_url' already exists. Skipping migration.")
                return
            
            # Add column
            print("🔄 Adding avatar_url column to users table...")
            conn.execute(text("""
                ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(255) NULL
            """))
            conn.commit()
            
            # Add comment (PostgreSQL specific)
            try:
                conn.execute(text("""
                    COMMENT ON COLUMN users.avatar_url IS 'URL to avatar image stored in MinIO'
                """))
                conn.commit()
            except Exception as e:
                # Comment might fail on some DB versions, but column addition is what matters
                print(f"⚠️  Could not add comment: {e}")
            
            print("✅ Migration completed successfully. Column 'avatar_url' added to users table.")
            
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        sys.exit(1)
    finally:
        engine.dispose()

if __name__ == "__main__":
    run_migration()

