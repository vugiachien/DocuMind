from fastapi import APIRouter, HTTPException, UploadFile, File, Depends, Query, BackgroundTasks
from pydantic import BaseModel
from fastapi.responses import Response, StreamingResponse
from typing import List, Optional
import uuid
import httpx
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_
import logging

from app.modules.agreements.schemas import (
    Agreement as ContractSchema, ContractCreate, Partner as PartnerSchema, PartnerCreate,
    ContractType as ContractTypeSchema, ContractTypeCreate, DashboardStats, Finding as RiskSchema, 
    ContractStatusCount, RiskUpdateSuggestion, ContractShareCreate, ContractShare as ContractShareSchema,
    PlatformCommentCreate, PlatformCommentOut, CommentReplyCreate, CommentReplyOut
)
from app.schemas.audit import AuditLogResponse # NEW: Audit schemas
from app.services.audit_service import AuditService # NEW: Audit service
from app.db.database import get_db
from app.db import models
from app.services.storage_service import storage_service
from app.services.document_service import document_service
from app.services.contract_service import contract_service
from app.core.dependencies import get_current_active_user, require_admin  # Auth & Admin dependencies

from app.core.rate_limiter import limiter
from fastapi import Request

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/", response_model=List[ContractSchema])
def get_contracts(
    status: Optional[str] = None, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)  # NEW: Require auth
):
    """Get all agreements, optionally filtered by status. Admin sees all, users see only their own."""
    try:
        logger.info(f"🔍 Fetching agreements for user {current_user.username}, role={current_user.role}")
        agreements = contract_service.get_contracts(db, current_user, status)
        logger.info(f"✅ Found {len(agreements)} agreements")
        return agreements
    except Exception as e:
        logger.error(f"❌ Error fetching agreements: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/deleted", response_model=List[dict])
def get_deleted_contracts(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)  # Admin only
):
    """
    [ADMIN ONLY] Get all deleted agreements with deletion info.
    Shows who deleted each agreement and when.
    """
    deleted_contracts = db.query(models.Agreement).filter(
        models.Agreement.deleted_at.isnot(None)
    ).order_by(models.Agreement.deleted_at.desc()).all()
    
    result = []
    for agreement in deleted_contracts:
        # Get deleter info
        deleter = None
        if agreement.deleted_by:
            deleter_user = db.query(models.User).filter(models.User.id == agreement.deleted_by).first()
            deleter = {
                "id": agreement.deleted_by,
                "username": deleter_user.username if deleter_user else "Unknown",
                "full_name": deleter_user.full_name if deleter_user else "Unknown"
            }
        
        result.append({
            "id": agreement.id,
            "contractNumber": agreement.contractNumber,
            "name": agreement.name,
            "deleted_at": agreement.deleted_at.isoformat() if agreement.deleted_at else None,
            "deleted_by": deleter,
            "original_owner_id": agreement.ownerId,
            "status_before_delete": agreement.status
        })
    
    return result


@router.get("/audit/{target_id}", response_model=List[AuditLogResponse])
def get_audit_logs_by_target(
    target_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)  # Admin only
):
    """
    [ADMIN ONLY] Get audit logs for any agreement by ID.
    Works even if the agreement has been deleted.
    Useful for investigating who did what on a deleted agreement.
    """
    logs = db.query(models.AuditLog).filter(
        models.AuditLog.targetType == "AGREEMENT",
        models.AuditLog.targetId == target_id
    ).order_by(models.AuditLog.timestamp.desc()).all()
    
    return logs


@router.get("/partners/list", response_model=List[PartnerSchema])
async def get_partners(db: Session = Depends(get_db)):
    return db.query(models.Partner).all()

@router.get("/types/list", response_model=List[ContractTypeSchema])
async def get_contract_types(db: Session = Depends(get_db)):
    return db.query(models.ContractType).all()



@router.get("/{contract_id}", response_model=ContractSchema)
def get_contract(
    contract_id: str, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)  # NEW: Require auth
):
    """Get a specific agreement by ID. Users can only access their own agreements."""
    return contract_service.get_contract(db, contract_id, current_user)

@router.get("/{contract_id}/history", response_model=List[AuditLogResponse])
def get_contract_history(
    contract_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """
    Get audit history for a agreement.
    """
    # Check access by fetching agreement first (will raise 403/404 if invalid)
    contract_service.get_contract(db, contract_id, current_user)
    
    return AuditService.get_contract_history(db, contract_id)

@router.put("/{contract_id}", response_model=ContractSchema)
def update_contract(
    contract_id: str,
    contract_in: ContractCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    updated_contract = contract_service.update_contract(db, contract_id, contract_in, current_user)
    AuditService.log_activity(db, current_user.id, "UPDATE", "AGREEMENT", contract_id, contract_in.dict(exclude_unset=True))
    return updated_contract

@router.delete("/{contract_id}")
def delete_contract(
    contract_id: str, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)  # NEW: Require auth
):
    """Delete a agreement and its file from MinIO. Users can only delete their own agreements."""
    agreement = contract_service.get_contract(db, contract_id, current_user)
    result = contract_service.delete_contract(db, contract_id, current_user)
    AuditService.log_activity(db, current_user.id, "DELETE", "AGREEMENT", contract_id, {"result": "success", "contract_name": agreement.name})
    return {"message": "Agreement deleted successfully"}


@router.post("/{contract_id}/restore")
def restore_contract(
    contract_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    """
    [ADMIN ONLY] Restore a soft-deleted agreement.
    """
    agreement = contract_service.restore_contract(db, contract_id, current_user)
    AuditService.log_activity(db, current_user.id, "RESTORE", "AGREEMENT", contract_id, {"result": "success", "contract_name": agreement.name})
    return {"message": "Agreement restored successfully", "contract_id": contract_id}


@router.delete("/{contract_id}/permanent")
def permanent_delete_contract(
    contract_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    """
    [ADMIN ONLY] Permanently delete a soft-deleted agreement and its files from MinIO.
    This action cannot be undone.
    """
    agreement = db.query(models.Agreement).filter(models.Agreement.id == contract_id).first()
    contract_name = agreement.name if agreement else "Unknown"
    contract_service.delete_contract(db, contract_id, current_user, hard_delete=True)
    AuditService.log_activity(db, current_user.id, "PERMANENT_DELETE", "AGREEMENT", contract_id, {"result": "success", "contract_name": contract_name})
    return {"message": "Agreement permanently deleted"}

@router.post("/", response_model=ContractSchema)
@limiter.limit("20/minute")
def create_contract(
    request: Request,
    agreement: ContractCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)  # NEW: Require auth
):
    """
    Create a new agreement (JSON only). Automatically sets owner to current user.
    """
    new_contract = contract_service.create_contract(db, agreement, current_user)
    AuditService.log_activity(db, current_user.id, "CREATE", "AGREEMENT", new_contract.id, {"contract_number": new_contract.contractNumber, "name": new_contract.name})
    return new_contract

@router.post("/extract-metadata")
def extract_contract_metadata(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Extract metadata (Partner, Agreement Type) from uploaded agreement file.
    Returns suggestions for auto-filling the form.
    """
    from app.services.metadata_extractor import metadata_extractor
    from app.services.document_service import document_service
    
    try:
        # 1. Read file content
        file_content = file.file.read()
        
        # 2. Extract text
        try:
            full_text = document_service.extract_text(file_content)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to extract text from file: {str(e)}")
        
        # 3. Get available partners and types
        partners = db.query(models.Partner).all()
        contract_types = db.query(models.ContractType).all()
        
        partner_list = [{"id": p.id, "name": p.name} for p in partners]
        type_list = [{"id": t.id, "name": t.name, "description": t.description} for t in contract_types]
        
        # 4. Extract metadata using LLM
        result = metadata_extractor.extract_metadata(
            document_text=full_text,
            available_partners=partner_list,
            available_types=type_list,
            max_chars=3000  # First 3000 chars for cost optimization
        )
        
        return {
            "success": True,
            "suggested_partner_id": result.get("suggested_partner_id"),
            "suggested_type_id": result.get("suggested_type_id"),
            "confidence": result.get("confidence", 0.0),
            "details": {
                "detected_partner_name": result.get("detected_partner_name"),
                "detected_type_name": result.get("detected_type_name")
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Metadata extraction failed: {str(e)}")


@router.post("/{contract_id}/upload")
def upload_contract_file(
    contract_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """Upload file for an existing agreement. Auto-detects template match and creates versions."""
    from app.core.validators import validate_contract_file, sanitize_filename
    from app.core.config import get_settings
    from app.services.template_matcher import compute_similarity, is_template_based

    settings = get_settings()

    agreement = db.query(models.Agreement).filter(models.Agreement.id == contract_id).first()
    if not agreement:
        raise HTTPException(status_code=404, detail="Agreement not found")

    if current_user.role != "admin" and agreement.ownerId != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to upload to this agreement")

    if not storage_service:
        raise HTTPException(status_code=503, detail="Storage service unavailable")

    # Validate and upload file
    file_size, content_type = validate_contract_file(file, max_size_mb=settings.MAX_FILE_SIZE_MB)
    file_uuid = str(uuid.uuid4())
    original_filename = sanitize_filename(file.filename)
    file_path = f"agreements/{file_uuid}/{original_filename}"
    file_extension = original_filename.lower().split('.')[-1]

    # Read file content for similarity check (before streaming to MinIO)
    file_content = file.file.read()
    import io
    try:
        storage_service.upload_file(
            file_data=io.BytesIO(file_content),
            length=len(file_content),
            object_name=file_path,
            content_type=content_type,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

    # ── Handle PDF async ────────────────────────────────────────────────
    if file_extension == 'pdf':
        agreement.fileUrl = file_path
        agreement.status = "converting"
        db.commit()
        from app.worker import convert_pdf_task
        background_tasks.add_task(convert_pdf_task, contract_id, file_path)
        AuditService.log_activity(db, current_user.id, "UPLOAD_FILE", "AGREEMENT", contract_id,
                                  {"filename": original_filename, "type": "pdf"})
        return {
            "filename": original_filename, "fileUrl": file_path,
            "status": "converting", "task_id": "background-task",
            "message": "PDF uploaded. Converting to DOCX in background..."
        }

    # ── DOCX: Template similarity check ─────────────────────────────────
    result = contract_service.process_new_contract_file(
        db=db,
        agreement=agreement,
        file_path=file_path,
        user_id=current_user.id
    )

    AuditService.log_activity(db, current_user.id, "UPLOAD_FILE", "AGREEMENT", contract_id,
                              {"filename": original_filename, "type": "docx",
                               "isTemplateBased": result["isTemplateBased"],
                               "similarity": result["templateSimilarity"]})

    return {
        "filename": original_filename,
        "fileUrl": file_path,
        "status": "draft",
        "isTemplateBased": result["isTemplateBased"],
        "templateSimilarity": result["templateSimilarity"],
        "currentVersion": result["currentVersion"],
        "message": result["message"],
    }

class AnalyzeRequest(BaseModel):
    """Request body for POST /{contract_id}/analyze"""
    full_context_mode: bool = False # If True, use full context LLM analysis
    use_law_analysis: bool = False  # If True, also analyze with law DB

@router.post("/{contract_id}/analyze", response_model=ContractSchema)
@limiter.limit("20/minute")
def analyze_contract(
    request: Request,
    contract_id: str,
    background_tasks: BackgroundTasks,
    analyze_body: AnalyzeRequest = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """Run AI analysis on a agreement using external RAG API."""
    full_context = (analyze_body.full_context_mode if analyze_body else False)
    agreement = contract_service.analyze_contract(db, contract_id, user=current_user, background_tasks=background_tasks, full_context_mode=full_context)

    # Proceed with analysis
    db.commit()

    # Log ANALYZE action
    clean_filename = agreement.fileUrl.split('/')[-1] if agreement.fileUrl else "Unknown"
    AuditService.log_activity(
        db, current_user.id, "ANALYZE", "AGREEMENT", contract_id,
        {
            "status": agreement.status,
            "risks_found": len(agreement.findings) if agreement.findings else 0,
            "full_context_mode": full_context,
            "contract_name": agreement.name,
            "original_filename": clean_filename
        }
    )
    return agreement


@router.post("/upload/check")
def check_contract_version(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Check for existing agreement version using regex on filename"""
    import re
    # Simple regex check for now
    match = re.search(r'(LOG-\d{4}-\d{4})', file.filename.upper())
    
    if match:
        extracted_number = match.group(1)
        existing_contract = db.query(models.Agreement).filter(models.Agreement.contractNumber == extracted_number).first()
        
        if existing_contract:
             # Convert SQLAlchemy model to Pydantic schema for response
            return {
                "isNewVersion": True,
                "agreement": ContractSchema.from_orm(existing_contract),
                "matchReason": f"Detected Agreement Number: {extracted_number}"
            }
            
    return {"isNewVersion": False, "agreement": None}

@router.post("/partners/", response_model=PartnerSchema)
def create_partner(
    partner_in: PartnerCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    """Create a new partner. Admin only."""
    new_partner = models.Partner(
        id=str(uuid.uuid4()),
        name=partner_in.name,
        taxCode=partner_in.taxCode,
        representative=partner_in.representative,
        address=partner_in.address,
        email=partner_in.email
    )
    db.add(new_partner)
    db.commit()
    db.refresh(new_partner)
    return new_partner

@router.put("/partners/{partner_id}", response_model=PartnerSchema)
def update_partner(
    partner_id: str,
    partner_in: PartnerCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    """Update a partner. Admin only."""
    partner = db.query(models.Partner).filter(models.Partner.id == partner_id).first()
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
        
    partner.name = partner_in.name
    partner.taxCode = partner_in.taxCode
    partner.representative = partner_in.representative
    partner.address = partner_in.address
    partner.email = partner_in.email
    
    db.commit()
    db.refresh(partner)
    return partner

@router.delete("/partners/{partner_id}")
def delete_partner(
    partner_id: str, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    """Delete a partner. Admin only."""
    partner = db.query(models.Partner).filter(models.Partner.id == partner_id).first()
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
        
    # Check for active (non-deleted) agreements using this partner
    active_contract_count = db.query(models.Agreement).filter(
        models.Agreement.partnerId == partner_id,
        models.Agreement.deleted_at.is_(None)
    ).count()
    if active_contract_count > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete: Used by {active_contract_count} active agreements.")

    try:
        db.delete(partner)
        db.commit()
    except Exception as e:
         db.rollback()
         raise HTTPException(status_code=400, detail="Cannot delete partner in use")
         
    return {"message": "Partner deleted"}

@router.get("/stats/dashboard", response_model=DashboardStats)
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """Get dashboard statistics. Admin sees all agreements, users see own + shared."""
    # Build base query — exclude soft-deleted agreements
    query = db.query(models.Agreement).filter(models.Agreement.deleted_at.is_(None))
    if current_user.role != "admin":
        # Include agreements owned by user OR shared with user/department
        owner_cond = models.Agreement.ownerId == current_user.id
        user_share_cond = models.Agreement.shares.any(
            and_(
                models.ContractShare.sharedType == 'user',
                models.ContractShare.targetId == current_user.id
            )
        )
        share_conditions = [owner_cond, user_share_cond]
        if current_user.departmentId:
            share_conditions.append(
                models.Agreement.shares.any(
                    and_(
                        models.ContractShare.sharedType == 'department',
                        models.ContractShare.targetId == current_user.departmentId
                    )
                )
            )
        query = query.filter(or_(*share_conditions))
    
    # Total count
    total = query.count()
    
    # Group by status
    stats = query.with_entities(
        models.Agreement.status, 
        func.count(models.Agreement.status)
    ).group_by(models.Agreement.status).all()
    status_counts = {status: count for status, count in stats}
    
    # Get 5 most recent agreements (with RBAC filter already applied)
    recent_contracts = query.order_by(models.Agreement.createdAt.desc()).limit(5).all()
    
    return DashboardStats(
        totalContracts=total,
        inReview=status_counts.get('review', 0),
        pendingApproval=status_counts.get('approval', 0) + status_counts.get('signing', 0),
        recentContracts=recent_contracts,
        contractsByStatus=[
            ContractStatusCount(status=s, count=c) for s, c in status_counts.items()
        ]
    )
@router.post("/types/", response_model=ContractTypeSchema)
def create_contract_type(
    contract_type_in: ContractTypeCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    """Create a new agreement type. Admin only."""
    # Check if code already exists
    existing = db.query(models.ContractType).filter(models.ContractType.code == contract_type_in.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Agreement type code already exists")
    
    new_type = models.ContractType(
        id=str(uuid.uuid4()),
        code=contract_type_in.code,
        name=contract_type_in.name,
        description=contract_type_in.description
    )
    db.add(new_type)
    db.commit()
    db.refresh(new_type)
    return new_type

@router.put("/types/{type_id}", response_model=ContractTypeSchema)
def update_contract_type(
    type_id: str,
    contract_type_in: ContractTypeCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    """Update a agreement type. Admin only."""
    contract_type = db.query(models.ContractType).filter(models.ContractType.id == type_id).first()
    if not contract_type:
        raise HTTPException(status_code=404, detail="Agreement type not found")
        
    contract_type.name = contract_type_in.name
    contract_type.description = contract_type_in.description
    # Code update usually restricted, but allowing here if needed, or check uniqueness
    if contract_type.code != contract_type_in.code:
         existing = db.query(models.ContractType).filter(models.ContractType.code == contract_type_in.code).first()
         if existing:
             raise HTTPException(status_code=400, detail="Agreement type code already exists")
         contract_type.code = contract_type_in.code
         
    db.commit()
    db.refresh(contract_type)
    return contract_type

@router.delete("/types/{type_id}")
def delete_contract_type(
    type_id: str, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    """Delete a agreement type. Admin only."""
    contract_type = db.query(models.ContractType).filter(models.ContractType.id == type_id).first()
    if not contract_type:
        raise HTTPException(status_code=404, detail="Agreement type not found")
        
    # Check for usage in active (non-deleted) Agreements
    contract_count = db.query(models.Agreement).filter(
        models.Agreement.agreementTypeId == type_id,
        models.Agreement.deleted_at.is_(None)  # Exclude soft-deleted agreements
    ).count()
    if contract_count > 0:
         raise HTTPException(status_code=400, detail=f"Cannot delete: Used by {contract_count} active agreements.")
         
    # Check for usage in AuditPolicies
    playbook_count = db.query(models.AuditPolicy).filter(models.AuditPolicy.agreementTypeId == type_id).count()
    if playbook_count > 0:
         raise HTTPException(status_code=400, detail=f"Cannot delete: Used by {playbook_count} audit_policies.")
         
    try:
        db.delete(contract_type)
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete agreement type: {e}")
        raise HTTPException(status_code=400, detail="Cannot delete agreement type due to database dependency.")
        
    return {"message": "Agreement type deleted"}


# ─────────────────────────────────────────────
# TEMPLATE ENDPOINTS (Admin only)
# ─────────────────────────────────────────────

@router.put("/types/{type_id}/template", response_model=ContractTypeSchema)
def upload_contract_type_template(
    type_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    """
    [ADMIN] Upload a DOCX template for a agreement type.
    The template is used to detect template-based agreements and as AI analysis reference.
    """
    from app.core.validators import validate_contract_file, sanitize_filename

    contract_type = db.query(models.ContractType).filter(models.ContractType.id == type_id).first()
    if not contract_type:
        raise HTTPException(status_code=404, detail="Agreement type not found")

    if not storage_service:
        raise HTTPException(status_code=503, detail="Storage service unavailable")

    # Validate file
    file_size, content_type = validate_contract_file(file, max_size_mb=10)
    safe_name = sanitize_filename(file.filename)
    if not safe_name.lower().endswith('.docx'):
        raise HTTPException(status_code=400, detail="Only DOCX files are supported for templates")

    # Upload to MinIO under templates/ prefix
    template_path = f"templates/{type_id}/{safe_name}"

    # If there is already a template and the path is different, delete the old one
    if contract_type.templateUrl and contract_type.templateUrl != template_path:
        try:
            storage_service.delete_file(contract_type.templateUrl)
            logger.info(f"🗑️ Deleted old template file: {contract_type.templateUrl}")
        except Exception as e:
            logger.warning(f"⚠️ Failed to delete old template file: {e}")

    try:
        storage_service.upload_file(
            file_data=file.file,
            length=file_size,
            object_name=template_path,
            content_type=content_type,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Template upload failed: {str(e)}")

    contract_type.templateUrl = template_path
    contract_type.htmlPreview = None  # Clear cache so new html can be generated
    db.commit()
    db.refresh(contract_type)
    logger.info(f"✅ Template uploaded for ContractType {type_id}: {template_path}")
    return contract_type


@router.get("/types/{type_id}/template")
def download_contract_type_template(
    type_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Download the template file for a agreement type."""
    contract_type = db.query(models.ContractType).filter(models.ContractType.id == type_id).first()
    if not contract_type:
        raise HTTPException(status_code=404, detail="Agreement type not found")
    if not contract_type.templateUrl:
        raise HTTPException(status_code=404, detail="No template set for this agreement type")
    if not storage_service:
        raise HTTPException(status_code=503, detail="Storage service unavailable")

    try:
        content = storage_service.download_file(contract_type.templateUrl)
        filename = contract_type.templateUrl.split("/")[-1]
        return Response(
            content=content,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to download template: {str(e)}")


@router.get("/types/{type_id}/template/stream")
def stream_contract_type_template(
    type_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Stream template DOCX directly from MinIO (bypasses CORS — used by docx-preview on frontend)."""
    from fastapi.responses import StreamingResponse
    import urllib.parse

    contract_type = db.query(models.ContractType).filter(models.ContractType.id == type_id).first()
    if not contract_type:
        raise HTTPException(status_code=404, detail="Agreement type not found")
    if not contract_type.templateUrl:
        raise HTTPException(status_code=404, detail="No template set for this agreement type")
    if not storage_service:
        raise HTTPException(status_code=503, detail="Storage service unavailable")

    try:
        data_stream = storage_service.get_file_stream(contract_type.templateUrl)
        filename = contract_type.templateUrl.split("/")[-1]
        safe_filename = urllib.parse.quote(filename, safe="")
        return StreamingResponse(
            data_stream.stream(32 * 1024),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f"inline; filename*=UTF-8''{safe_filename}"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to stream template: {str(e)}")


@router.get("/types/{type_id}/template/html")
def get_contract_type_template_html(
    type_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """
    Get full HTML preview of a agreement type template.
    Prioritizes pre-saved HTML, otherwise converts DOCX to HTML.
    """
    contract_type = db.query(models.ContractType).filter(models.ContractType.id == type_id).first()
    
    if not contract_type:
        raise HTTPException(status_code=404, detail="Agreement type not found")
        
    if not contract_type.templateUrl:
        raise HTTPException(status_code=404, detail="No template set for this agreement type")
        
    if not storage_service:
        raise HTTPException(status_code=503, detail="Storage service unavailable")
        
    try:
        # 1. Check for Cached HTML first
        if contract_type.htmlPreview:
             return {"html": contract_type.htmlPreview, "cached": True}

        # 2. Fallback: Download DOCX and Convert to HTML
        file_content = storage_service.download_file(contract_type.templateUrl)
        
        # Use document_service which correctly handles io.BytesIO and adds styling
        from app.services.document_service import document_service
        try:
            html = document_service.convert_docx_to_html_with_comments(file_content)
            
            # Save to cache
            contract_type.htmlPreview = html
            db.commit()
            
        except Exception as e:
            logger.error(f"Failed to convert DOCX to HTML: {e}")
            raise HTTPException(status_code=500, detail="Document format not supported for preview")
            
        return {"html": html, "cached": False}
        
    except Exception as e:
        logger.error(f"HTML Preview extraction error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to extract HTML preview: {str(e)}")


@router.put("/{contract_id}/findings/{risk_id}/update-suggestion")
def update_risk_suggestion(
    contract_id: str,
    risk_id: str,
    payload: RiskUpdateSuggestion,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """
    Update the suggested_text for a finding before applying.
    Useful for manual-review findings with placeholders.
    """
    return contract_service.update_risk_suggestion(db, contract_id, risk_id, payload, current_user)



@router.post("/{contract_id}/findings/{risk_id}/accept")
def accept_risk_recommendation(
    contract_id: str, 
    risk_id: str, 
    current_version: str = Query(..., description="The version of the agreement the user is seeing (e.g. v1.0)"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """
    Accept by applying fix. Enforces Optimistic Locking via current_version.
    """
    return contract_service.accept_risk_recommendation(db, contract_id, risk_id, current_version, current_user)


@router.post("/{contract_id}/findings/accept-batch")
def accept_risk_batch(
    contract_id: str, 
    risk_ids: List[str], 
    current_version: str = Query(..., description="The version of the agreement the user is seeing"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """
    Accept multiple finding recommendations at once.
    """
    return contract_service.accept_risk_batch(db, contract_id, risk_ids, current_version, current_user)


@router.get("/{contract_id}/download")
def download_contract(
    contract_id: str, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """
    Download the current agreement file
    """
    # Use centralized permission check (View access is sufficient for download)
    agreement = contract_service.check_permission(db, contract_id, current_user, required='view')

    clean_filename = agreement.fileUrl.split('/')[-1] if agreement.fileUrl else "Unknown"
    AuditService.log_activity(db, current_user.id, "DOWNLOAD_FILE", "AGREEMENT", contract_id, {"filename": clean_filename, "version": agreement.currentVersion})
        
    if not agreement.fileUrl:
        raise HTTPException(status_code=404, detail="No file found for this agreement")
        
    if not storage_service:
        raise HTTPException(status_code=503, detail="Storage service unavailable")
        
    try:
        file_content = storage_service.download_file(agreement.fileUrl)
        
        # Determine filename
        filename = f"{agreement.contractNumber}_{agreement.currentVersion}.docx"
        
        return Response(
            content=file_content, 
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document", 
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except Exception as e:
        logger.error(f"Error downloading file: {e}")
        raise HTTPException(status_code=500, detail="Failed to download file")


@router.post("/{contract_id}/compare")
def compare_contract_versions(
    contract_id: str,
    version_id_1: str = Query(..., description="First version ID"),
    version_id_2: str = Query(..., description="Second version ID"),
    db: Session = Depends(get_db)
):
    """
    Compare two versions of a agreement.
    """
    # 1. Fetch Version Records
    v1 = db.query(models.ContractVersion).filter(models.ContractVersion.id == version_id_1).first()
    v2 = db.query(models.ContractVersion).filter(models.ContractVersion.id == version_id_2).first()
    
    if not v1 or not v2:
        raise HTTPException(status_code=404, detail="One or both versions not found")
        
    if not storage_service:
        raise HTTPException(status_code=503, detail="Storage service unavailable")
        
    try:
        # 2. Always extract fresh text from file so ~~strike~~ sentinels are present.
        # (Old DB cache was extracted without sentinel markers, so we bypass it here.)
        def get_text(ver):
            content = storage_service.download_file(ver.fileUrl)
            text = document_service.extract_text(content)
            # Refresh cache with sentinel-aware text
            ver.extractedText = text
            return text

        text1 = get_text(v1)
        text2 = get_text(v2)
        
        db.commit() # Save refreshed extracted text
        
        # 3. Compute Diff
        # Refactor document_service.compare_documents to accept TEXT strings, not bytes?
        # Checking document_service: compare_documents(file1_content, file2_content) usually extracts text inside.
        # I should provide a helper in document_service or just compare text here using difflib
        
        # Assuming document_service has a method to compare text directly, or we assume it takes bytes.
        # If it takes bytes, we can't use the text cache easily without changing document_service.
        # Let's check document_service.
        
        # Call compare_texts directly from global document_service instance
        
        result = document_service.compare_texts(text1, text2)
        return result
        
    except Exception as e:
        logger.error(f"Comparison error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to compare versions: {str(e)}")


@router.get("/{contract_id}/versions/{version_id}/preview")
def get_version_preview(
    contract_id: str,
    version_id: str,
    max_chars: int = Query(500, description="Maximum characters to return. Set to -1 for full text."),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """
    Get text preview of a specific agreement version.
    Returns first N characters for quick preview, or full text if max_chars=-1.
    """
    # 1. Validate permissions
    agreement = contract_service.check_permission(db, contract_id, current_user, required='view')
    
    # 2. Fetch version record
    version = db.query(models.ContractVersion).filter(
        models.ContractVersion.id == version_id,
        models.ContractVersion.agreementId == contract_id
    ).first()
    
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    
    if not storage_service:
        raise HTTPException(status_code=503, detail="Storage service unavailable")
    
    try:
        # 3. Check Cache First
        # 3. Check Cache First
        if version.htmlPreview:
             full_text = version.htmlPreview
        elif version.extractedText:
             full_text = version.extractedText
        else:
             # Fallback: Download and Extract
             file_content = storage_service.download_file(version.fileUrl)
             full_text = document_service.extract_text(file_content)
             
             # Save to cache
             version.extractedText = full_text
             db.commit()
        
        # 5. Truncate to max_chars
        if max_chars == -1:
            preview_text = full_text
            truncated = False
        else:
            preview_text = full_text[:max_chars]
            truncated = len(full_text) > max_chars
            if truncated:
                preview_text += "..."
        
        return {
            "versionId": version_id,
            "version": version.version,
            "previewText": preview_text,  # Changed from "preview" to "previewText"
            "fullLength": len(full_text),
            "truncated": truncated,
            "maxChars": max_chars
        }
        
    except Exception as e:
        logger.error(f"Preview extraction error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to extract preview: {str(e)}")


@router.get("/{contract_id}/versions/{version_id}/html")
def get_version_html(
    contract_id: str,
    version_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """
    Get full HTML preview of a agreement version.
    Prioritizes pre-saved HTML (from TinyMCE), otherwise converts DOCX to HTML.
    """
    # 1. Validate permissions
    agreement = contract_service.check_permission(db, contract_id, current_user, required='view')
    
    # 2. Fetch version record
    version = db.query(models.ContractVersion).filter(
        models.ContractVersion.id == version_id,
        models.ContractVersion.agreementId == contract_id
    ).first()
    
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    
    if not storage_service:
        raise HTTPException(status_code=503, detail="Storage service unavailable")
    
    try:
        # 3. Check for Cached HTML first
        if version.htmlPreview:
             return {"html": version.htmlPreview, "cached": True}

        # 4. Fallback: Download DOCX and Convert to HTML
        file_content = storage_service.download_file(version.fileUrl)
        
        # If it's a PDF, convert to DOCX first
        if version.fileUrl.lower().endswith('.pdf') or b'%PDF' in file_content[:10]:
            try:
                from app.services.document_service import document_service
                file_content = document_service.convert_pdf_to_docx(file_content)
            except Exception as e:
                logger.error(f"Failed to convert PDF template to DOCX for preview: {e}")
                return {"html": "<tr><td><p style='color:red'>Failed to generate preview for PDF format.</p></td></tr>", "cached": False}
        
        # Use document_service which correctly handles io.BytesIO and adds styling
        from app.services.document_service import document_service
        try:
            html = document_service.convert_docx_to_html_with_comments(file_content)
        except Exception as e:
            logger.error(f"Failed to convert DOCX to HTML: {e}")
            raise HTTPException(status_code=500, detail="Document format not supported for preview")
            
        return {"html": html, "cached": False}
        
    except Exception as e:
        logger.error(f"HTML Preview extraction error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to extract HTML preview: {str(e)}")


class ManualVersionCreate(BaseModel):
    content: str
    changes: str = "Manual edit"
    resolved_risk_ids: List[str] = []

@router.post("/{contract_id}/versions/manual")
def create_manual_version(
    contract_id: str,
    payload: ManualVersionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """
    Create a new version manually from text content.
    Used for the "Review & Edit" mode.
    Also marks specified findings as resolved.
    """
    new_version = contract_service.create_manual_version(
        db, 
        contract_id, 
        payload.content, 
        payload.changes, 
        current_user,
        payload.resolved_risk_ids
    )
    AuditService.log_activity(db, current_user.id, "CREATE_VERSION", "AGREEMENT", contract_id, {"version": new_version.version, "changes": payload.changes})
    return new_version


@router.get("/{contract_id}/versions/{version_id}/file")
def get_version_file(
    contract_id: str,
    version_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """
    Download full DOCX file for version preview rendering.
    Returns file as blob for client-side mammoth.js processing.
    
    ✅ OPTIMIZATION: Added HTTP caching for instant repeat previews
    - Cache-Control: 24 hour browser cache
    - ETag: Version ID for cache validation
    """
    # Validate permissions
    agreement = contract_service.check_permission(db, contract_id, current_user, required='view')
    
    # Fetch version
    version = db.query(models.ContractVersion).filter(
        models.ContractVersion.id == version_id,
        models.ContractVersion.agreementId == contract_id
    ).first()
    
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    
    if not storage_service:
        raise HTTPException(status_code=503, detail="Storage service unavailable")
    
    try:
        # Download file from MinIO
        file_content = storage_service.download_file(version.fileUrl)
        
        # ✅ Return with HTTP cache headers
        return Response(
            content=file_content,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={
                "Content-Disposition": f'inline; filename="{version.version}.docx"',
                # ✅ Browser cache for 24 hours (repeat previews instant!)
                "Cache-Control": "public, max-age=86400",
                # ✅ ETag for cache validation (version ID is unique)
                "ETag": f'"{version.id}"',
                # ✅ Allow cache to be revalidated
                "Vary": "Accept-Encoding"
            }
        )
    except Exception as e:
        logger.error(f"Error serving version file: {e}")
        raise HTTPException(status_code=500, detail="Failed to load file")


@router.get("/{contract_id}/versions/{version_id}/comments")
def get_version_comments(
    contract_id: str,
    version_id: str,
    db: Session = Depends(get_db)
):
    """
    Extract comments from DOCX file for a specific version.
    Returns list of comments with author, date, and text.
    """
    # Validate agreement
    agreement = db.query(models.Agreement).filter(models.Agreement.id == contract_id).first()
    if not agreement:
        raise HTTPException(status_code=404, detail="Agreement not found")
    
    # Fetch version
    version = db.query(models.ContractVersion).filter(
        models.ContractVersion.id == version_id,
        models.ContractVersion.agreementId == contract_id
    ).first()
    
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    
    try:
        # Download file from MinIO
        file_content = storage_service.download_file(version.fileUrl)
        
        # Extract comments using document_service
        comments = document_service.extract_docx_comments(file_content)
        
        logger.info(f"📝 Extracted {len(comments)} comments from version {version.version}")
        
        return {
            "comments": comments,
            "count": len(comments)
        }
        
    except Exception as e:
        logger.error(f"Comment extraction error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to extract comments: {str(e)}")


@router.get("/versions/{version_id}/download")
def download_contract_version(
    version_id: str,
    db: Session = Depends(get_db)
):
    """
    Download a specific agreement version.
    """
    version = db.query(models.ContractVersion).filter(models.ContractVersion.id == version_id).first()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    
    if not storage_service:
        raise HTTPException(status_code=503, detail="Storage service unavailable")
        
    try:
        file_content = storage_service.download_file(version.fileUrl)
        
        # Determine filename (we don't have agreement number easily here without join, but frontend sends filename in blob link)
        # However, for direct download via API, we should provide a good name.
        # Let's fetch agreement to get number.
        agreement = db.query(models.Agreement).filter(models.Agreement.id == version.agreementId).first()
        contract_number = agreement.contractNumber if agreement else "agreement"
        
        filename = f"{contract_number}_{version.version}.docx"
        
        return Response(
            content=file_content,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"'
            }
        )
    except Exception as e:
        logger.error(f"Error downloading version: {e}")
        raise HTTPException(status_code=500, detail="Failed to download file")


@router.get("/{contract_id}/conversion-status")
async def get_conversion_status(contract_id: str, db: Session = Depends(get_db)):
    """
    Get PDF conversion status for async uploads.
    Used by frontend to poll conversion progress.
    """
    agreement = db.query(models.Agreement).filter(
        models.Agreement.id == contract_id
    ).first()
    
    if not agreement:
        raise HTTPException(status_code=404, detail="Agreement not found")
    
    return {
        "status": agreement.status,
        "fileUrl": agreement.fileUrl,
        "message": {
            "converting": "PDF is being converted to DOCX...",
            "draft": "Conversion complete. Ready for analysis.",
            "error": "PDF conversion failed. Please try uploading again."
        }.get(agreement.status, "Unknown status")
    }


@router.post("/{contract_id}/shares", response_model=ContractShareSchema)
def share_contract(
    contract_id: str,
    share_data: ContractShareCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """Share a agreement with a user or department."""
    share = contract_service.share_contract(db, contract_id, share_data, current_user)
    
    # Resolve names
    target_name = "Unknown"
    if share.sharedType == 'user':
        user = db.query(models.User).filter(models.User.id == share.targetId).first()
        target_name = user.full_name if user else "Unknown User"
        share.targetName = target_name
    elif share.sharedType == 'department':
        dept = db.query(models.Department).filter(models.Department.id == share.targetId).first()
        target_name = dept.name if dept else "Unknown Dept"
        share.targetName = target_name
    
    # Log SHARE action
    AuditService.log_activity(
        db, current_user.id, "SHARE", "AGREEMENT", contract_id,
        {
            "shared_with": target_name,
            "shared_type": share.sharedType,
            "permission": share.permission
        }
    )
         
    return share

@router.delete("/{contract_id}/shares/{share_id}")
def revoke_share(
    contract_id: str,
    share_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """Revoke a share."""
    # Get share details before revoking for audit log
    share = db.query(models.ContractShare).filter(models.ContractShare.id == share_id).first()
    share_info = {}
    if share:
        share_info = {"target_type": share.sharedType, "target_id": share.targetId}
    
    contract_service.revoke_share(db, contract_id, share_id, current_user)
    
    # Log REVOKE action
    AuditService.log_activity(
        db, current_user.id, "REVOKE", "AGREEMENT", contract_id,
        {"share_id": share_id, **share_info}
    )
    return {"message": "Share revoked"}

@router.get("/{contract_id}/shares", response_model=List[ContractShareSchema])
def get_shares(
    contract_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """List all shares for a agreement."""
    agreement = contract_service.get_contract(db, contract_id, current_user)
    
    results = []
    for share in agreement.shares:
         target_name = "Unknown"
         if share.sharedType == 'user':
             u = db.query(models.User).filter(models.User.id == share.targetId).first()
             target_name = u.full_name if u else "Unknown"
         elif share.sharedType == 'department':
             d = db.query(models.Department).filter(models.Department.id == share.targetId).first()
             target_name = d.name if d else "Unknown"
             
         share.targetName = target_name
         results.append(share)
         
    return results


# ── Platform Comments ─────────────────────────────────────────────────────────

def _build_comment_out(c: models.ContractComment) -> dict:
    """Convert ORM ContractComment to dict matching PlatformCommentOut."""
    return {
        "id": c.id,
        "agreementId": c.agreementId,
        "versionId": c.versionId,
        "versionName": c.version.version if c.version else None,
        "authorId": c.authorId,
        "authorName": c.authorName,
        "quote": c.quote,
        "paragraphIndex": c.paragraph_index,
        "offsetStart": c.offset_start,
        "offsetEnd": c.offset_end,
        "text": c.text,
        "resolved": c.resolved,
        "createdAt": c.createdAt,
        "replies": [
            {
                "id": r.id,
                "commentId": r.commentId,
                "authorId": r.authorId,
                "authorName": r.authorName,
                "text": r.text,
                "createdAt": r.createdAt,
            }
            for r in c.replies
        ],
    }


@router.get("/{contract_id}/platform-comments", response_model=List[PlatformCommentOut])
def list_platform_comments(
    contract_id: str,
    version_id: Optional[str] = Query(None, description="Filter by version (omit for all versions)"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """List all platform comments for a agreement (optionally filtered by version)."""
    # Verify access
    contract_service.get_contract(db, contract_id, current_user)

    q = (
        db.query(models.ContractComment)
        .filter(models.ContractComment.agreementId == contract_id)
        .order_by(models.ContractComment.createdAt.asc())
    )
    if version_id:
        q = q.filter(models.ContractComment.versionId == version_id)

    return [_build_comment_out(c) for c in q.all()]


@router.post("/{contract_id}/platform-comments", response_model=PlatformCommentOut, status_code=201)
def create_platform_comment(
    contract_id: str,
    payload: PlatformCommentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """Create a new platform comment on a agreement (optionally anchored to a version + quoted text)."""
    # Verify access
    contract_service.get_contract(db, contract_id, current_user)

    comment = models.ContractComment(
        agreementId=contract_id,
        versionId=payload.versionId,
        authorId=current_user.id,
        quote=payload.quote,
        paragraph_index=payload.paragraphIndex,
        offset_start=payload.offsetStart,
        offset_end=payload.offsetEnd,
        text=payload.text,
        createdAt=datetime.utcnow(),
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return _build_comment_out(comment)


@router.patch("/{contract_id}/platform-comments/{comment_id}/resolve", response_model=PlatformCommentOut)
def resolve_platform_comment(
    contract_id: str,
    comment_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """Toggle resolved state of a comment."""
    comment = db.query(models.ContractComment).filter(
        models.ContractComment.id == comment_id,
        models.ContractComment.agreementId == contract_id
    ).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    comment.resolved = not comment.resolved
    db.commit()
    db.refresh(comment)
    return _build_comment_out(comment)


@router.delete("/{contract_id}/platform-comments/{comment_id}", status_code=204)
def delete_platform_comment(
    contract_id: str,
    comment_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """Delete a platform comment (author or admin only)."""
    comment = db.query(models.ContractComment).filter(
        models.ContractComment.id == comment_id,
        models.ContractComment.agreementId == contract_id
    ).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.authorId != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not allowed to delete this comment")
    db.delete(comment)
    db.commit()
    return None


@router.post(
    "/{contract_id}/platform-comments/{comment_id}/replies",
    response_model=CommentReplyOut,
    status_code=201,
)
def create_comment_reply(
    contract_id: str,
    comment_id: str,
    payload: CommentReplyCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """Add a reply to a platform comment."""
    comment = db.query(models.ContractComment).filter(
        models.ContractComment.id == comment_id,
        models.ContractComment.agreementId == contract_id
    ).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    reply = models.CommentReply(
        commentId=comment_id,
        authorId=current_user.id,
        text=payload.text,
        createdAt=datetime.utcnow(),
    )
    db.add(reply)
    db.commit()
    db.refresh(reply)
    return {
        "id": reply.id,
        "commentId": reply.commentId,
        "authorId": reply.authorId,
        "authorName": reply.authorName,
        "text": reply.text,
        "createdAt": reply.createdAt,
    }
