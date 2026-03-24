import logging
import os
import json
import redis

from app.db.database import SessionLocal
from app.db import models
from app.modules.notifications.service import notification_service
from app.services.storage_service import storage_service
from app.services.document_service import document_service
from app.core.constants import (
    ContractStatus, ProcessingStatus, TaskConfig, NotificationType
)
from app.core.config import get_settings
from app.core.color_logger import setup_color_logging

setup_color_logging()

logger = logging.getLogger(__name__)

# Get settings
settings = get_settings()

api_key = os.getenv("EXTERNAL_AI_API_KEY", "")

def publish_contract_event(event_name: str, contract_id: str, status: str, **extra):
    """
    Helper to push notifications to SSE channel via Redis.
    """
    try:
        payload = {
            "contract_id": str(contract_id),
            "status": status,
            "event": event_name
        }
        # Filter out None values to keep payload small
        for key, value in extra.items():
            if value is not None:
                payload[key] = value

        r = redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6390/0"))
        r.publish("contract_updates", json.dumps(payload))
    except Exception as e:
        logger.error(f"Failed to publish agreement event {event_name}: {e}")

def _normalize_quote(text: str) -> str:
    """
    Normalize whitespace in quote text to ensure consistent matching between
    backend DB and frontend HTML rendering.
    - Converts newlines to spaces
    - Collapses multiple whitespace to single space
    - Trims leading/trailing whitespace
    """
    import re
    if not text:
        return ""
    # Replace newlines and multiple spaces with single space
    normalized = re.sub(r'\s+', ' ', text)
    return normalized.strip()


def process_upload_task(version_id: str, full_context_mode: bool = False):
    """
    Background task to processing agreement upload:
    1. Download file
    2. Extract Text (and save to DB)
    3. Call AI Analysis
    """
    logger.info(f"🚀 Starting task for version: {version_id}")
    db = SessionLocal()
    try:
        # 1. Fetch Version & Agreement
        version = db.query(models.ContractVersion).filter(models.ContractVersion.id == version_id).first()
        if not version:
            logger.error(f"Version {version_id} not found")
            return "Version not found"
        
        agreement = db.query(models.Agreement).filter(models.Agreement.id == version.agreementId).first()
        
        # Update status to processing
        version.processingStatus = "processing"
        db.commit()
        
        # 2. Download File
        if not storage_service:
            raise Exception("Storage service unavailable")
            
        file_content = storage_service.download_file(version.fileUrl)
        
        # 3. Extract Text and Generate HTML Preview
        try:
            # Extract text for analysis/search
            full_text = document_service.extract_text(file_content)
            version.extractedText = full_text
            
            # ✅ Generate HTML Preview for instant UI rendering
            html_preview = document_service.convert_docx_to_html(file_content)
            version.htmlPreview = html_preview
            
            db.commit()
        except Exception as e:
            logger.warning(f"Error processing file content: {e}")
            # Continue anyway, extraction/preview is non-critical for main flow but critical for UX
            pass

        # 4. Call AI Analysis (if this is the current version being analyzed)
        logger.info(f"Calling AI Analysis for version {version_id}...")

        # CHECK: If no AuditPolicy is selected, skip AI Analysis (Treat rules as empty)
        if not agreement.auditPolicyId:
            logger.info(f"⚠️ No AuditPolicy selected for agreement {agreement.id}. Skipping AI Analysis (Rules considered empty).")
            
            # Clear existing findings (if any) and set status
            db.query(models.Finding).filter(models.Finding.agreementId == agreement.id).delete()
            
            version.processingStatus = "completed"
            agreement.status = "review"
            db.commit()
            
            publish_contract_event(
                event_name="analysis_completed",
                contract_id=agreement.id,
                status="review",
                version_id=str(version.id),
                message="Skipped analysis (No AuditPolicy)"
            )
            return "success_no_analysis"
        
        from app.services.external_ai_client import external_ai_client
        
        # Generate Presigned URL for AI Service to download
        contract_url = storage_service.get_file_url(version.fileUrl)
        
        # Fetch AuditPolicy Name, Agreement Type Name, and Template URL for Context
        playbook_name = "General"
        if agreement.auditPolicyId:
            audit_policy = db.query(models.AuditPolicy).filter(models.AuditPolicy.id == agreement.auditPolicyId).first()
            if audit_policy:
                # Safety check: severity_rule should not be used as audit_policy filter
                if audit_policy.type == "severity_rule":
                    logger.warning(f"⚠️ Selected audit_policy '{audit_policy.name}' is a severity_rule, not a audit_policy. Falling back to General.")
                    playbook_name = "General"
                else:
                    playbook_name = audit_policy.name
                
        contract_type_name = "General Agreement"
        if agreement.agreementTypeId:
            ctype = db.query(models.ContractType).filter(models.ContractType.id == agreement.agreementTypeId).first()
            if ctype:
                contract_type_name = ctype.name
                
        # NEW: Fetch actual template from the exact v0.0 baseline used at upload
        template_url = None
        if agreement.isTemplateBased:
            v0 = db.query(models.ContractVersion).filter(
                models.ContractVersion.agreementId == agreement.id,
                models.ContractVersion.version == "v0.0",
                models.ContractVersion.versionType == "template"
            ).first()
            if v0:
                template_url = v0.fileUrl

        # Generate presigned URL for AI service to download template (if needed)
        template_presigned_url = None
        if agreement.isTemplateBased and template_url:
            try:
                template_presigned_url = storage_service.get_file_url(template_url)
            except Exception as e:
                logger.warning(f"Could not get presigned URL for template: {e}")

        # Fetch severity rule context for AI prompt
        severity_context = ""
        try:
            severity_playbooks = db.query(models.AuditPolicy).filter(
                models.AuditPolicy.type == "severity_rule",
                models.AuditPolicy.status == "active"
            ).all()
            if severity_playbooks:
                sev_lines = []
                for pb in severity_playbooks:
                    for rule in pb.rules:
                        parts = [f"- [{rule.severity or 'Unknown'}] {rule.category or ''} / {rule.name}: {rule.description or ''}"]
                        if rule.clauseRef:
                            parts.append(f"  Clause: {rule.clauseRef}")
                        if rule.acceptableDeviation:
                            parts.append(f"  Acceptable deviation: {rule.acceptableDeviation}")
                        sev_lines.append("\n".join(parts))
                severity_context = "\n".join(sev_lines)
                logger.info(f"📋 Built severity context from {len(sev_lines)} rules ({len(severity_context)} chars)")
        except Exception as e:
            logger.warning(f"Could not fetch severity rule docs: {e}")

        try:
            analysis_result = external_ai_client.analyze_contract_sync(
                contract_id=str(agreement.id),
                contract_url=contract_url,
                language="vi",  # Default — AI service auto-detects and overrides for English agreements
                top_k_rules=5,
                playbook_name=playbook_name,
                contract_type=contract_type_name,
                # NEW: Template context
                is_template_based=bool(agreement.isTemplateBased),
                template_url=template_presigned_url,
                # NEW: Severity rule context
                severity_context=severity_context,
                full_context_mode=full_context_mode,
            )
        except Exception as e:
            logger.error(f"AI Service Call Failed: {e}")
            raise e
        
        # 5. Process Results (Save Findings) - Atomic Operation with Savepoint
        # Use nested transaction so if finding insertion fails, we don't lose existing findings
        try:
            with db.begin_nested():  # Savepoint
                # Clear existing findings for this agreement (since we are re-analyzing)
                db.query(models.Finding).filter(models.Finding.agreementId == agreement.id).delete()

                # Save debug section pairs (for template-based analysis debug table)
                section_pairs = analysis_result.get("section_pairs")
                if section_pairs:
                    agreement.sectionPairsJson = section_pairs

                for idx, section in enumerate(analysis_result.get("sections", [])):

                    recommendation_text = ", ".join(section.get("recommendations", [])) or section.get("suggested_text", "")
                    
                    finding = models.Finding(
                        agreementId=agreement.id,
                        description=section.get("risk_summary", ""),
                        severity=section.get("risk_level", "medium").lower(),
                        page=0,
                        section_index=idx,
                        section=f"{section.get('section_id', '')} - {section.get('title', '')}",
                        term=section.get("title", ""),
                        quote=_normalize_quote(section.get("content", "")),
                        recommendation=recommendation_text,
                        original_text=section.get("original_text", ""),
                        suggested_text=section.get("suggested_text", ""),
                        auto_fixable=section.get("auto_fixable", False),
                        risk_type=section.get("risk_type", "modification"),
                        risk_source=section.get("risk_source", "audit_policy"),  # Dynamic: "audit_policy" or "template"
                        confidence_score=section.get("confidence_score"),
                    )
                    db.add(finding)
        except Exception as e:
            logger.error(f"Failed to save audit_policy findings (rolled back to savepoint): {e}")
            raise RuntimeError(f"Failed to save analysis results to database: {e}") from e

        # Update Status
        version.processingStatus = "completed"
        agreement.status = "review"
        db.commit()
        
        publish_contract_event(
            event_name="analysis_completed",
            contract_id=agreement.id,
            status="review",
            version_id=str(version.id)
        )
        
        # Notify Owner
        if agreement.ownerId:
            notification_service.create_notification(
                db, 
                agreement.ownerId, 
                "Analysis Completed", 
                f"Your agreement '{agreement.name}' is ready for review.", 
                type="success",
                link=f"/agreements/{agreement.id}"
            )
        logger.info(f"✅ Task finished for version {version_id}")
        return "success"

    except Exception as e:
        logger.error(f"❌ Task failed: {e}")
        db.rollback()
        # Re-fetch to update status
        version = db.query(models.ContractVersion).filter(models.ContractVersion.id == version_id).first()
        if version:
            version.processingStatus = "failed"
            version.processingError = str(e)
            db.commit()
        
        # Also update agreement status if needed
        agreement = None
        if version:
            agreement = db.query(models.Agreement).filter(models.Agreement.id == version.agreementId).first()
        if agreement:
            agreement.status = "error" # Or keep as draft
            db.commit()

            publish_contract_event(
                event_name="analysis_failed",
                contract_id=agreement.id,
                status="error",
                version_id=str(version.id) if version else None,
                error=str(e)
                
            )

            # Notify Owner (Failure)
            if agreement.ownerId:
                notification_service.create_notification(
                    db, 
                    agreement.ownerId, 
                    "Analysis Failed", 
                    f"Analysis failed for '{agreement.name}': {str(e)[:100]}", 
                    type="error",
                    link=f"/agreements/{agreement.id}"
                )
            
    finally:
        db.close()

def convert_pdf_task(contract_id: str, pdf_file_url: str):
    """
    Background task to convert PDF to DOCX with 5 minute timeout.
    """
    logger.info(f"🔄 Starting PDF conversion for agreement: {contract_id}")
    db = SessionLocal()
    try:
        # 1. Fetch Agreement
        agreement = db.query(models.Agreement).filter(
            models.Agreement.id == contract_id
        ).first()
        
        if not agreement:
            logger.error(f"Agreement {contract_id} not found")
            return "Agreement not found"
        
        # Update status to converting
        agreement.status = "converting"
        db.commit()
        
        # 2. Download PDF
        if not storage_service:
            raise Exception("Storage service unavailable")
            
        logger.info(f"📥 Downloading PDF from {pdf_file_url}")
        pdf_content = storage_service.download_file(pdf_file_url)
        
        # 3. Convert PDF to DOCX
        logger.info(f"🔄 Converting PDF to DOCX (Time limit: 300s)...")
        docx_content = document_service.convert_pdf_to_docx(pdf_content)
        logger.info(f"✅ Conversion successful: {len(pdf_content)} → {len(docx_content)} bytes")
        
        # 4. Generate new filename
        import os
        path_parts = pdf_file_url.split('/')
        pdf_filename = path_parts[-1]
        directory = "/".join(path_parts[:-1])
        
        base_name = pdf_filename.rsplit('.', 1)[0]
        new_filename = f"{base_name}.docx"
        docx_path = f"{directory}/{new_filename}"
        
        # 5. Upload DOCX to MinIO
        logger.info(f"📤 Uploading DOCX to {docx_path}")
        import io
        file_obj = io.BytesIO(docx_content)
        
        storage_service.client.put_object(
            storage_service.bucket,
            docx_path,
            file_obj,
            len(docx_content),
            content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
        
        # 6. Apply template matching & auto-versioning via shared service
        from app.services.contract_service import contract_service
        contract_service.process_new_contract_file(
            db=db,
            agreement=agreement,
            file_path=docx_path,
            user_id=agreement.ownerId or "system",
        )
        
        publish_contract_event(
            event_name="conversion_completed",
            contract_id=agreement.id,
            status="draft"
        )
        
        logger.info(f"✅ PDF converted successfully: {contract_id}")
        return "success"
        
    except Exception as e:
        logger.error(f"❌ PDF conversion failed: {e}")
        db.rollback()
        
        # Re-fetch because rollback might have detached object
        agreement = db.query(models.Agreement).filter(
            models.Agreement.id == contract_id
        ).first()
        if agreement:
            agreement.status = "error"
            # agreement.notes = f"Conversion failed: {str(e)[:200]}" # If models support notes update here
            db.commit()

            publish_contract_event(
                event_name="conversion_failed",
                contract_id=agreement.id,
                status="error",
                error=str(e)
            )
        
        raise
    finally:
        db.close()

@celery_app.task
def cleanup_zombie_contracts():
    """
    Periodic task to find agreements stuck in 'converting' for too long.
    """
    logger.info("🧹 Running Zombie Cleanup Task...")
    db = SessionLocal()
    from datetime import datetime, timedelta
    
    try:
        threshold = datetime.utcnow() - timedelta(minutes=TaskConfig.ZOMBIE_THRESHOLD_MINUTES)
        
        zombies = db.query(models.Agreement).filter(
            models.Agreement.status == ContractStatus.CONVERTING,
            models.Agreement.updatedAt < threshold
        ).all()
        
        if not zombies:
            logger.info("✅ No zombie agreements found.")
            return "no_zombies"
            
        count = 0
        for agreement in zombies:
            logger.warning(f"🧟 Found zombie agreement {agreement.id} (stuck since {agreement.updatedAt})")
            agreement.status = ContractStatus.ERROR
            count += 1
            
        db.commit()
        logger.info(f"🧹 Cleaned up {count} zombie agreements.")
        return f"cleaned_{count}"
    except Exception as e:
        logger.error(f"❌ Zombie cleanup failed: {e}")
        db.rollback()
    finally:
        db.close()


def analyze_playbook_task(playbook_id: str):
    """
    Analyze audit_policy document and extract rules
    """
    logger.info(f"🚀 Starting AuditPolicy Analysis for: {playbook_id}")
    db = SessionLocal()
    try:
        from app.services.playbook_extractor import playbook_extractor
        
        audit_policy = db.query(models.AuditPolicy).filter(models.AuditPolicy.id == playbook_id).first()
        if not audit_policy:
            return "AuditPolicy not found"
            
        # 1. Download Content (Bytes)
        content = storage_service.download_file(audit_policy.fileUrl)
        # Note: document_service.extract_text NOT needed here as extractor uses DocLoader
        
        # 2. Extract Rules via Chunking (Section-based)
        rules_data = playbook_extractor.extract_rules(content, audit_policy.name)
        
        # 3. Save Rules
        # Delete old rules if any
        db.query(models.PlaybookRule).filter(models.PlaybookRule.auditPolicyId == playbook_id).delete()
        
        for r in rules_data:
            new_rule = models.PlaybookRule(
                auditPolicyId=audit_policy.id,
                category=r.get("category", "General"),
                name=r.get("name", "Untitled Rule"),
                description=r.get("description", ""),
                standardClause=r.get("standardClause", ""),
                severity=r.get("severity", "medium").lower(),
                clauseRef=r.get("clauseRef"),
                acceptableDeviation=r.get("acceptableDeviation"),
                approvalLevel=r.get("approvalLevel"),
            )
            db.add(new_rule)
        
        audit_policy.status = "active"
        db.commit()
        logger.info(f"✅ AuditPolicy Analysis completed. Extracted {len(rules_data)} rules.")
        
        # 4. Ingest into Knowledge Base (Milvus) for RAG
        try:
            from app.services.external_ai_client import external_ai_client
            
            # Get internal URL for AI service to download
            playbook_url = storage_service.get_file_url(audit_policy.fileUrl)
            
            logger.info(f"🧠 Syncing AuditPolicy {audit_policy.name} to Milvus...")
            external_ai_client.ingest_knowledge_base_document_sync(
                document_id=audit_policy.name, # Use filename as DocID for now, or audit_policy.id? Using name makes "Rule from [DocID]" cleaner
                title=audit_policy.name,
                source_url=playbook_url,
                replace=True
            )
            logger.info(f"✅ AuditPolicy synced to Knowledge Base successfully.")
            
        except Exception as e:
            logger.error(f"⚠️ Failed to sync audit_policy to Knowledge Base: {e}")
            # Non-blocking, extracting rules for UI is primary goal here.
            # But effectively this means RAG won't work for this audit_policy yet.
        
    except Exception as e:
        logger.error(f"❌ AuditPolicy Task Failed: {e}")
        try:
            audit_policy = db.query(models.AuditPolicy).filter(models.AuditPolicy.id == playbook_id).first()
            if audit_policy:
                audit_policy.status = "failed"
                db.commit()
        except:
            pass
    finally:
        db.close()
