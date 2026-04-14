
from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

def migrate():
    engine = create_engine(DATABASE_URL)
    with engine.begin() as connection:
        # Add contractTypeId column to playbooks table
        try:
            connection.execute(text("""
                ALTER TABLE playbooks 
                ADD COLUMN "contractTypeId" VARCHAR REFERENCES contract_types(id);
            """))
            print("Successfully added contractTypeId to playbooks table")
        except Exception as e:
            if "duplicate column" in str(e):
                print("Column contractTypeId already exists in playbooks table")
            else:
                print(f"Error adding column: {e}")

if __name__ == "__main__":
    migrate()
