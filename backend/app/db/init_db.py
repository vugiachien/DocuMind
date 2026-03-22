from app.db.database import engine, SessionLocal
# Import all models to ensure they are registered with Base.metadata before create_all
from app.db.models import (
    Base, Partner, ContractType, User, Department, Agreement, 
    ContractShare, Finding, AuditPolicy, PlaybookRule, ContractVersion, 
    AuditLog, Notification
)
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────
# Columns that may be missing from existing tables.
# Uses IF NOT EXISTS so each statement is idempotent and safe to
# re‑run on every startup.
# ──────────────────────────────────────────────────────────────────
_ENSURE_COLUMNS_SQL = [
    # users table – added by SQL migrations 004 & 005
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(255) NULL',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP NULL',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS "departmentId" VARCHAR REFERENCES departments(id)',

    # agreements table – soft delete (migration 003) & misc
    'ALTER TABLE agreements ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP',
    'ALTER TABLE agreements ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(255)',

    # contract_types table – template & preview
    'ALTER TABLE contract_types ADD COLUMN IF NOT EXISTS "templateUrl" VARCHAR NULL',
    'ALTER TABLE contract_types ADD COLUMN IF NOT EXISTS htmlpreview TEXT NULL',

    # contract_versions table – analysis cache columns
    'ALTER TABLE contract_versions ADD COLUMN IF NOT EXISTS extractedtext TEXT NULL',
    'ALTER TABLE contract_versions ADD COLUMN IF NOT EXISTS htmlpreview TEXT NULL',
    'ALTER TABLE contract_versions ADD COLUMN IF NOT EXISTS processingstatus VARCHAR DEFAULT \'pending\'',
    'ALTER TABLE contract_versions ADD COLUMN IF NOT EXISTS processingerror VARCHAR NULL',
    'ALTER TABLE contract_versions ADD COLUMN IF NOT EXISTS "versionType" VARCHAR DEFAULT \'upload\'',

    # agreements table – missing template debug column
    'ALTER TABLE agreements ADD COLUMN IF NOT EXISTS "sectionPairsJson" JSON NULL',


    # findings table – missing AI analysis columns
    'ALTER TABLE findings ADD COLUMN IF NOT EXISTS section_index INTEGER DEFAULT 0',
    'ALTER TABLE findings ADD COLUMN IF NOT EXISTS risk_type VARCHAR DEFAULT \'modification\'',
    'ALTER TABLE findings ADD COLUMN IF NOT EXISTS risk_source VARCHAR DEFAULT \'audit_policy\'',
    'ALTER TABLE findings ADD COLUMN IF NOT EXISTS confidence_score INTEGER NULL',
    'CREATE INDEX IF NOT EXISTS ix_risks_risk_type ON findings (risk_type)',
    'CREATE INDEX IF NOT EXISTS ix_risks_risk_source ON findings (risk_source)',

    # audit_policies table – missing type column
    'ALTER TABLE audit_policies ADD COLUMN IF NOT EXISTS type VARCHAR DEFAULT \'audit_policy\' NOT NULL',
    'CREATE INDEX IF NOT EXISTS ix_playbooks_type ON audit_policies (type)',
]


def _ensure_columns():
    """Add any columns that create_all() cannot add to existing tables."""
    from sqlalchemy import text
    with engine.connect() as conn:
        for sql in _ENSURE_COLUMNS_SQL:
            try:
                conn.execute(text(sql))
            except Exception as e:
                # Column may already exist, or table may not exist yet — both are fine
                logger.debug(f"Column ensure skipped: {e}")
        conn.commit()


def init_db():
    logger.info("Running Alembic migrations...")
    try:
        import subprocess, sys, os
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        subprocess.run(
            [sys.executable, '-m', 'alembic', 'upgrade', 'head'],
            cwd=backend_dir,
            check=True,
            capture_output=True,
        )
        logger.info("Alembic migrations applied successfully.")
    except Exception as e:
        logger.warning(f"Alembic migration via subprocess failed ({e}), falling back to create_all...")
        Base.metadata.create_all(bind=engine)
        # Stamp Alembic version to head so it won't replay migrations on next startup
        try:
            import subprocess as _sp, sys as _sys, os as _os
            _backend_dir = _os.path.dirname(_os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))
            _sp.run(
                [_sys.executable, '-m', 'alembic', 'stamp', 'head'],
                cwd=_backend_dir,
                check=True,
                capture_output=True,
            )
            logger.info("Alembic stamped to head after create_all fallback.")
        except Exception as stamp_err:
            logger.warning(f"Alembic stamp failed: {stamp_err}")
    
    logger.info("Ensuring base tables exist via create_all (idempotent)...")
    Base.metadata.create_all(bind=engine)

    # ── Patch missing columns on existing tables ──
    logger.info("Ensuring all columns exist (ALTER TABLE IF NOT EXISTS)...")
    _ensure_columns()
    
    db = SessionLocal()
    try:
        # Seed Partners
        if db.query(Partner).count() == 0:
            logger.info("Seeding partners...")
            partners = [
                Partner(id='1', name='MAERSK LOGISTICS VIETNAM', taxCode='0301234567', 
                        representative='Nguyen Van A', address='123 Nguyen Hue, District 1, HCMC', 
                        email='contact@maerskvn.com'),
                Partner(id='2', name='DHL SUPPLY CHAIN VIETNAM', taxCode='0302345678',
                        representative='Tran Thi B', address='456 Le Loi, District 3, HCMC',
                        email='info@dhl.com.vn'),
                Partner(id='3', name='COSCO SHIPPING LINES', taxCode='0303456789',
                        representative='Le Van C', address='789 Tran Hung Dao, District 5, HCMC',
                        email='support@cosco.com.vn'),
            ]
            db.add_all(partners)
            db.commit()
            
        # Seed Agreement Types
        if db.query(ContractType).count() == 0:
            logger.info("Seeding agreement types...")
            types = [
                ContractType(id='1', code='FFW', name='Freight Forwarding Agreement', 
                             description='International freight forwarding services'),
                ContractType(id='2', code='WHS', name='Warehousing Agreement', 
                             description='Storage and distribution services'),
                ContractType(id='3', code='TRP', name='Transportation Agreement',
                             description='Domestic and cross-border transport'),
            ]
            db.add_all(types)
            db.commit()
        
        # Seed default admin user
        if db.query(User).count() == 0:
            logger.info("Seeding default admin user...")
            from app.core.security import get_password_hash
            admin_user = User(
                username="admin",
                email="admin@savvycom.vn",
                hashed_password=get_password_hash("admin123"),
                full_name="Administrator",
                role="admin",
                is_active=True,
            )
            db.add(admin_user)
            db.commit()
            logger.info("Default admin user created (username: admin, password: admin123)")
            
        logger.info("Database initialization completed successfully.")
        
    except Exception as e:
        logger.error(f"Error initializing database: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    init_db()
