from typing import Dict, Optional
import logging

# Setup logger
logger = logging.getLogger(__name__)


class ExternalAIClient:
    """
    Client for AI analysis.
    This was previously dialing an external microservice, but for graduation project simplicity,
    it now directly invokes the logic methods migrated into the backend.
    """
    
    def __init__(self):
        logger.info("🤖 AI Client configured (Monolith Mode)")

    async def extract_playbook_rules(self, file_content: bytes, filename: str) -> Dict:
        """
        Extract audit_policy rules.
        """
        from app.services.playbook_extractor import playbook_extractor
        rules_data = playbook_extractor.extract_rules(file_content, filename)
        return {"rules": rules_data, "status": "success"}

    async def ingest_knowledge_base_document(self, document_id: str, title: str, source_url: str, language: str = "vi", version: str = "1.0", replace: bool = False) -> Dict:
        """
        Trigger ingestion for a document file.
        In Monolithic mode, we can just call it directly.
        """
        # Because ingestion logic might be heavy, we run it synchronously here
        # or we could make it async. For now we use the sync wrapper.
        return self.ingest_knowledge_base_document_sync(document_id, title, source_url, language, version, replace)

    async def remove_knowledge_base_document(self, document_id: str) -> Dict:
        """
        Remove every chunk previously ingested.
        """
        from app.services.ai.ingestion_service import delete_document
        try:
            delete_document(document_id)
            return {"status": "removed", "document_id": document_id}
        except Exception as e:
            logger.error(f"Error removing document {document_id}: {e}")
            return {"status": "error", "error": str(e)}

    async def analyze_contract_with_rag(
        self,
        contract_id: str,
        contract_url: str,
        language: str = "vi",
        top_k_rules: int = 3,
        playbook_name: str = None,
        contract_type: str = "General Agreement",
        is_template_based: bool = False,
        template_url: Optional[str] = None,
        severity_context: Optional[str] = None,
    ) -> Dict:
        """Trigger AI-assisted review for an uploaded agreement using RAG."""
        from app.services.ai.contract_analysis import analyze_contract
        # analyze_contract is async in the AI module
        result = await analyze_contract(
            contract_id=contract_id,
            contract_url=contract_url,
            language=language,
            top_k_rules=top_k_rules,
            playbook_name=playbook_name,
            contract_type=contract_type,
            is_template_based=is_template_based,
            template_url=template_url,
            severity_doc_ids=None,
            severity_context=severity_context or "",
            full_context_mode=False
        )
        return result

    def analyze_contract_sync(
        self,
        contract_id: str,
        contract_url: str,
        language: str = "vi",
        top_k_rules: int = 3,
        playbook_name: str = None,
        contract_type: str = "General Agreement",
        is_template_based: bool = False,
        template_url: Optional[str] = None,
        severity_context: Optional[str] = None,
        full_context_mode: bool = False,
    ) -> Dict:
        """Synchronous version using asyncio loop"""
        import asyncio
        from app.services.ai.contract_analysis import analyze_contract
        
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import nest_asyncio
            nest_asyncio.apply()
        
        coro = analyze_contract(
            contract_id=contract_id,
            contract_url=contract_url,
            language=language,
            top_k_rules=top_k_rules,
            playbook_name=playbook_name,
            contract_type=contract_type,
            is_template_based=is_template_based,
            template_url=template_url,
            severity_doc_ids=None,
            severity_context=severity_context or "",
            full_context_mode=full_context_mode
        )
        return loop.run_until_complete(coro)

    def ingest_knowledge_base_document_sync(self, document_id: str, title: str, source_url: str, language: str = "vi", version: str = "1.0", replace: bool = False) -> Dict:
        """
        Synchronous ingestion.
        """
        from app.services.ai.ingestion_service import ingest_document
        try:
            result = ingest_document(
                document_id=document_id,
                source_url=source_url,
                title=title,
                language=language,
                version=version,
                replace_existing=replace
            )
            return result
        except Exception as e:
            logger.error(f"Ingestion failed: {e}")
            raise Exception(f"AI Service Ingestion failed: {str(e)}")

# Singleton instance
external_ai_client = ExternalAIClient()
