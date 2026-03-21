from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Body, Response, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.database import get_db
from app.db import models
from app.schemas import audit_policy as schemas
import uuid
from datetime import datetime
from app.services.storage_service import storage_service
from app.core.dependencies import get_current_active_user, require_admin

router = APIRouter()

@router.get("/{id}/preview")
def get_playbook_preview(
    id: str, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """Get presigned URL for audit_policy preview"""
    audit_policy = db.query(models.AuditPolicy).filter(models.AuditPolicy.id == id).first()
    if not audit_policy:
        raise HTTPException(status_code=404, detail="AuditPolicy not found")
        
    url = storage_service.get_file_url_for_external_api(audit_policy.fileUrl)
    return {"url": url}

@router.get("/{id}/stream")
def stream_playbook(
    id: str, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """Stream audit_policy file content directly (Bypasses CORS issues with MinIO)"""
    audit_policy = db.query(models.AuditPolicy).filter(models.AuditPolicy.id == id).first()
    if not audit_policy:
        raise HTTPException(status_code=404, detail="AuditPolicy not found")
    
    try:
        # Get stream from MinIO
        data_stream = storage_service.get_file_stream(audit_policy.fileUrl)
        
        # Determine media type
        media_type = "application/octet-stream"
        if audit_policy.name.endswith('.pdf'):
            media_type = "application/pdf"
        elif audit_policy.name.endswith('.docx'):
            media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        elif audit_policy.name.endswith('.txt'):
            media_type = "text/plain"
            
        # Encode filename for HTTP header (handle unicode characters)
        import urllib.parse
        safe_filename = urllib.parse.quote(audit_policy.name, safe='')
        
        return StreamingResponse(
            data_stream.stream(32*1024), 
            media_type=media_type,
            headers={"Content-Disposition": f"inline; filename*=UTF-8''{safe_filename}"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to stream file: {str(e)}")

@router.get("/{id}/rules", response_model=List[schemas.PlaybookRule])
def get_playbook_rules(
    id: str, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """Get all rules for a specific audit_policy"""
    audit_policy = db.query(models.AuditPolicy).filter(models.AuditPolicy.id == id).first()
    if not audit_policy:
        raise HTTPException(status_code=404, detail="AuditPolicy not found")
        
    rules = db.query(models.PlaybookRule).filter(models.PlaybookRule.auditPolicyId == id).all()
    return rules

@router.put("/rules/{rule_id}", response_model=schemas.PlaybookRule)
def update_playbook_rule(
    rule_id: str,
    rule_update: schemas.PlaybookRuleUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    """Update a audit_policy rule's severity"""
    rule = db.query(models.PlaybookRule).filter(models.PlaybookRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
        
    if rule_update.severity:
        rule.severity = rule_update.severity.lower()
        # Potentially update other fields if needed, but severity is the main request
        
    db.commit()
    db.refresh(rule)
    return rule

@router.get("/", response_model=List[schemas.AuditPolicy])
def list_playbooks(
    type: Optional[str] = Query(None, description="Filter by document type: 'audit_policy' or 'severity_rule'"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """List all audit_policies, optionally filtered by type"""
    query = db.query(models.AuditPolicy).order_by(models.AuditPolicy.uploadedAt.desc())
    if type:
        query = query.filter(models.AuditPolicy.type == type)
    audit_policies = query.all()
    # Add rule count manually if not computed
    for p in audit_policies:
        p.ruleCount = db.query(models.PlaybookRule).filter(models.PlaybookRule.auditPolicyId == p.id).count()
    return audit_policies

@router.get("/{id}", response_model=schemas.AuditPolicy)
def get_playbook(
    id: str, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """Get specific audit_policy details"""
    audit_policy = db.query(models.AuditPolicy).filter(models.AuditPolicy.id == id).first()
    if not audit_policy:
        raise HTTPException(status_code=404, detail="AuditPolicy not found")
    
    # Add rule count
    audit_policy.ruleCount = db.query(models.PlaybookRule).filter(models.PlaybookRule.auditPolicyId == id).count()
    return audit_policy

@router.post("/upload", response_model=schemas.AuditPolicy)
def upload_playbook(
    file: UploadFile = File(...),
    contract_type_id: str = Form(...),
    doc_type: str = Form('audit_policy'),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    """Upload a new audit_policy or severity rule document"""
    try:
        # Validate file
        if not file.filename.endswith(('.pdf', '.docx', '.txt')):
             raise HTTPException(status_code=400, detail="Invalid file format. Only PDF, DOCX, TXT allowed.")
        
        # Sync read
        file_content = file.file.read()
        
        # Upload to MinIO
        import io
        file_ext = file.filename.split('.')[-1]
        object_name = f"audit_policies/{uuid.uuid4()}.{file_ext}"
        storage_service.upload_file(
            file_data=io.BytesIO(file_content),
            length=len(file_content),
            object_name=object_name,
            content_type=file.content_type
        )
        
        # Validate doc_type
        allowed_types = ['audit_policy', 'severity_rule']
        if doc_type not in allowed_types:
            doc_type = 'audit_policy'
        
        # Create DB Record
        new_playbook = models.AuditPolicy(
            name=file.filename,
            fileUrl=object_name,
            status='processing', # Auto-start processing
            uploadedAt=datetime.utcnow(),
            agreementTypeId=contract_type_id,
            type=doc_type
        )
        db.add(new_playbook)
        db.commit()
        db.refresh(new_playbook)
        
        # Trigger Background Analysis
        from app.worker import analyze_playbook_task
        analyze_playbook_task.delay(new_playbook.id)
        
        new_playbook.ruleCount = 0
        return new_playbook
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@router.post("/{id}/analyze", response_model=schemas.AuditPolicy)
def analyze_playbook(
    id: str, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    """Analyze audit_policy document and extract rules"""
    audit_policy = db.query(models.AuditPolicy).filter(models.AuditPolicy.id == id).first()
    if not audit_policy:
        raise HTTPException(status_code=404, detail="AuditPolicy not found")
    
    # Update status to processing
    audit_policy.status = 'processing'
    db.commit()
    
    # Ideally this should be a background task
    # For MVP, we will run synchonously or trigger a background task
    # Currently triggering a background task is better
    from app.worker import analyze_playbook_task
    analyze_playbook_task.delay(id)
    
    return audit_policy

@router.delete("/{id}")
def delete_playbook(
    id: str, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    """Delete a audit_policy"""
    audit_policy = db.query(models.AuditPolicy).filter(models.AuditPolicy.id == id).first()
    if not audit_policy:
        raise HTTPException(status_code=404, detail="AuditPolicy not found")
    
    # Unlink agreements (Set auditPolicyId = NULL) to avoid ForeignKeyViolation
    linked_contracts = db.query(models.Agreement).filter(models.Agreement.auditPolicyId == id).all()
    for agreement in linked_contracts:
        agreement.auditPolicyId = None
    
    # Delete file from MinIO (optional, keeping it simple for now)
    
    db.delete(audit_policy)
    db.commit()
    return {"message": "AuditPolicy deleted successfully"}

@router.put("/{id}", response_model=schemas.AuditPolicy)
def update_playbook(
    id: str,  
    playbook_update: schemas.PlaybookCreate, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)
):
    """Update audit_policy details"""
    audit_policy = db.query(models.AuditPolicy).filter(models.AuditPolicy.id == id).first()
    if not audit_policy:
        raise HTTPException(status_code=404, detail="AuditPolicy not found")
    
    audit_policy.name = playbook_update.name
    audit_policy.description = playbook_update.description
    if playbook_update.agreementTypeId:
        audit_policy.agreementTypeId = playbook_update.agreementTypeId
    db.commit()
    db.refresh(audit_policy)
    
    # Add rule count
    audit_policy.ruleCount = db.query(models.PlaybookRule).filter(models.PlaybookRule.auditPolicyId == id).count()
    return audit_policy

