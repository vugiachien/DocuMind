import os
from sqlalchemy.orm import Session
from app.db.database import SessionLocal
from app.db import models
from app.core.security import get_password_hash
import uuid
import datetime

def seed_custom_user():
    db = SessionLocal()
    try:
        user_email = "vugiachien2004@gmail.com"
        
        # Check if user exists
        existing_user = db.query(models.User).filter(models.User.email == user_email).first()
        if existing_user:
            existing_user.hashed_password = get_password_hash("Giachien1@")
            db.commit()
            print(f"Updated password for {user_email}")
            return
            
        new_user = models.User(
            id=str(uuid.uuid4()),
            email=user_email,
            username="vugiachien2004",
            full_name="Vu Gia Chien",
            hashed_password=get_password_hash("Giachien1@"),
            role="admin",
            created_at=datetime.datetime.utcnow()
        )
        db.add(new_user)
        db.commit()
        print(f"Seeded custom user: {user_email}")
    except Exception as e:
        print(f"Error seeding user: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_custom_user()
