import sys
import os

# Add backend directory to path so we can import app modules
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.db.database import SessionLocal
from app.db.models import User
from app.core.security import get_password_hash
import uuid

def seed_admin_user():
    db = SessionLocal()
    try:
        username = "admin"
        # Check if user exists
        existing_user = db.query(User).filter(User.username == username).first()
        if existing_user:
            print(f"User '{username}' already exists.")
            return
        raw_password = "Admin@2024!"  # NOTE: Change this in production!
        
        admin_user = User(
            id=str(uuid.uuid4()),
            username=username,
            email="admin@example.com",
            full_name="Administrator",
            hashed_password=get_password_hash(raw_password),
            role="admin",
            is_active=True
        )
        
        db.add(admin_user)
        db.commit()
        print(f"Successfully created user '{username}' with password '{raw_password}'")
        
    except Exception as e:
        print(f"Error seeding user: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_admin_user()
