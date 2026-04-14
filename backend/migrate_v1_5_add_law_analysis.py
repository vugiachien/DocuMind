"""
Migration v1.5 – Add Law Analysis columns.
Run: python migrate_v1_5_add_law_analysis.py
"""
import os
from sqlalchemy import create_engine, text

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@localhost:5435/demo_contract_db")
engine = create_engine(DATABASE_URL)

MIGRATIONS = [
    # Add risk_source to risks table
    """
    ALTER TABLE risks
    ADD COLUMN IF NOT EXISTS risk_source VARCHAR DEFAULT 'playbook';
    """,
    # Index for risk_source filtering
    """
    CREATE INDEX IF NOT EXISTS ix_risks_risk_source ON risks (risk_source);
    """,
    # Add use_law_analysis to contracts table
    """
    ALTER TABLE contracts
    ADD COLUMN IF NOT EXISTS use_law_analysis BOOLEAN DEFAULT FALSE;
    """,
]

def run():
    with engine.connect() as conn:
        for stmt in MIGRATIONS:
            print(f"Running: {stmt.strip()[:60]}...")
            conn.execute(text(stmt))
        conn.commit()
    print("✅ Migration v1.5 completed successfully.")

if __name__ == "__main__":
    run()
