from sqlalchemy.orm import Session
from app.db import models
from typing import Optional, List

class AgreementRepository:
    """
    Data Access Layer (Repository) for Agreements.
    Separates SQLAlchemy queries from business logic.
    """
    def get_by_id(self, db: Session, agreement_id: str) -> Optional[models.Agreement]:
        return db.query(models.Agreement).filter(models.Agreement.id == agreement_id).first()
        
    def get_all(self, db: Session) -> List[models.Agreement]:
        return db.query(models.Agreement).all()

    def get_active_by_partner(self, db: Session, partner_id: str) -> List[models.Agreement]:
        return db.query(models.Agreement).filter(
            models.Agreement.partnerId == partner_id,
            models.Agreement.deleted_at.is_(None)
        ).all()

agreement_repository = AgreementRepository()
