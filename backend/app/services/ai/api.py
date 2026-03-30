from __future__ import annotations

import logging
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, HttpUrl
from dotenv import load_dotenv

# Configure logging so INFO-level progress messages are visible
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

load_dotenv()

from ingestion_service import (
    DocumentExistsError,
    DocumentNotFoundError,
    delete_document,
    ingest_document,
)
from contract_analysis import ContractAnalysisError, analyze_contract


app = FastAPI(title="Knowledge Base Ingestion API")


from typing import List, Optional

class IngestRequest(BaseModel):
    document_id: str
    source_url: HttpUrl
    title: str
    language: str = "vi"
    version: Optional[str] = None
    replace: bool = False


class IngestResponse(BaseModel):
    document_id: str
    title: str
    chunk_count: int
    file_path: str
    language: str
    version: Optional[str]


class ContractAnalysisRequest(BaseModel):
    contract_id: str
    contract_url: HttpUrl
    language: str = "vi"
    top_k_rules: int = Field(default=3, ge=1, le=10)
    playbook_name: Optional[str] = None
    contract_type: str = "General Agreement"
    # Template Feature: when True, AI compares upload vs template instead of AuditPolicy RAG
    is_template_based: bool = False
    template_url: Optional[str] = None
    # Clause Severity: pre-built text context for severity classification
    severity_context: str = ""
    full_context_mode: bool = False


class ContractAnalysisResponse(BaseModel):
    contract_id: str
    language: str
    sections: list
    section_pairs: Optional[list] = None

@app.post("/documents", response_model=IngestResponse)
def create_document(payload: IngestRequest):
    try:
        result = ingest_document(
            document_id=payload.document_id,
            source_url=str(payload.source_url),
            title=payload.title,
            language=payload.language,
            version=payload.version,
            replace_existing=payload.replace,
        )
        return result
    except DocumentExistsError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.delete("/documents/{document_id}")
def remove_document(document_id: str):
    try:
        delete_document(document_id)
        return {"status": "removed", "document_id": document_id}
    except DocumentNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/agreements/analyze", response_model=ContractAnalysisResponse)
async def analyze_contract_endpoint(payload: ContractAnalysisRequest):
    try:
        result = await analyze_contract(
            contract_id=payload.contract_id,
            contract_url=str(payload.contract_url),
            language=payload.language,
            top_k_rules=payload.top_k_rules,
            playbook_name=payload.playbook_name,
            contract_type=payload.contract_type,
            is_template_based=payload.is_template_based,
            template_url=payload.template_url,
            severity_doc_ids=None,
            severity_context=payload.severity_context,
            full_context_mode=payload.full_context_mode,
        )
        return result
    except ContractAnalysisError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


if __name__ == "__main__":
    uvicorn.run(
        "api:app",
        host="0.0.0.0",
        port=8009,
        reload=False,
    )
