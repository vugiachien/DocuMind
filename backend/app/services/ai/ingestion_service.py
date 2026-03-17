from __future__ import annotations

import shutil
import tempfile
from dataclasses import asdict
from pathlib import Path
from typing import Optional

import requests
import os
from pymilvus import Collection, MilvusException, connections

from document_pipeline import (
    DocumentMeta,
    EmbeddingService,
    KnowledgeBaseBuilder,
    MilvusVectorStore,
)

COLLECTION_NAME = "knowledge_base"
DOWNLOAD_ROOT = Path("uploads")
DOWNLOAD_ROOT.mkdir(exist_ok=True)


class DocumentExistsError(Exception):
    """Raised when attempting to ingest a document that already exists."""


class DocumentNotFoundError(Exception):
    """Raised when attempting to remove a document that does not exist."""


_EMBEDDER: Optional[EmbeddingService] = None


def _get_embedder() -> EmbeddingService:
    global _EMBEDDER
    if _EMBEDDER is None:
        _EMBEDDER = EmbeddingService()
    return _EMBEDDER


def _get_store() -> MilvusVectorStore:
    embedder = _get_embedder()
    uri = os.getenv("MILVUS_URI")
    return MilvusVectorStore(collection_name=COLLECTION_NAME, embedding_dim=embedder.dimension, uri=uri)


def _collection() -> Collection:
    if not connections.has_connection("default"):
        uri = os.getenv("MILVUS_URI")
        if uri:
            print(f"Connecting to Milvus at {uri}...")
            connections.connect(uri=uri)
        else:
            host = os.getenv("MILVUS_HOST", "localhost")
            port = os.getenv("MILVUS_PORT", "19530")
            print(f"Connecting to Milvus at {host}:{port}...")
            connections.connect(host=host, port=port)
    try:
        col = Collection(COLLECTION_NAME)
    except MilvusException as exc:
        raise DocumentNotFoundError(f"Collection '{COLLECTION_NAME}' not found: {exc}") from exc
    return col


def document_exists(document_id: str) -> bool:
    try:
        col = _collection()
    except DocumentNotFoundError:
        return False
    try:
        resp = col.query(expr=f'document_id == "{document_id}"', limit=1, output_fields=["chunk_id"])
        return len(resp) > 0
    except MilvusException:
        return False


def delete_document(document_id: str) -> None:
    try:
        col = _collection()
    except DocumentNotFoundError as exc:
        raise DocumentNotFoundError(str(exc)) from exc

    try:
        deleted = col.delete(expr=f'document_id == "{document_id}"')
    except MilvusException as exc:
        raise RuntimeError(f"Failed to delete document '{document_id}': {exc}") from exc

    delete_count = deleted.delete_count if hasattr(deleted, "delete_count") else None
    if not delete_count:
        raise DocumentNotFoundError(f"Document '{document_id}' not found in collection.")
    col.flush()


def _download_file(source_url: str, filename_hint: Optional[str] = None) -> Path:
    response = requests.get(source_url, stream=True, timeout=60)
    response.raise_for_status()

    suffix = Path(filename_hint or source_url.split("/")[-1]).suffix or ".docx"
    
    # Validate file type - only DOCX allowed
    # PDFs should be converted to DOCX by Backend before ingestion
    if suffix.lower() not in [".docx", ".txt"]:
        raise ValueError(
            f"Unsupported file type: {suffix}. Only .docx and .txt files are supported. "
            f"For PDF files, please convert to DOCX first using pdf2docx. "
            f"Backend API handles this conversion automatically on upload."
        )
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        for chunk in response.iter_content(chunk_size=8192):
            if chunk:
                tmp.write(chunk)
        temp_path = Path(tmp.name)

    destination = DOWNLOAD_ROOT / temp_path.name
    shutil.move(str(temp_path), destination)
    return destination


def ingest_document(
    document_id: str,
    source_url: str,
    title: str,
    language: str = "vi",
    version: Optional[str] = None,
    replace_existing: bool = False,
) -> dict:
    if document_exists(document_id):
        if not replace_existing:
            raise DocumentExistsError(f"Document '{document_id}' already exists")
        delete_document(document_id)

    file_path = _download_file(source_url, filename_hint=title)
    meta = DocumentMeta(
        document_id=document_id,
        source_path=str(file_path),
        title=title,
        language=language,
        version=version,
    )

    embedder = _get_embedder()
    store = _get_store()
    builder = KnowledgeBaseBuilder(embedder, store)
    chunk_count = builder.ingest(file_path, meta)

    result = asdict(meta)
    result["chunk_count"] = chunk_count
    result["file_path"] = str(file_path)
    return result
