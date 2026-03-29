"""
Full Context Analysis — analyzes the entire agreement in one LLM call
(no chunking / no Milvus search), with a 2-stage Generate → Verify pipeline.

Improvements applied:
 1. Programmatic Template Diff (_compute_template_diff) using difflib
 2. risk_source_detail field for tracing finding origin
 3. risk_type dynamic from LLM response
 4. risk_source based on context (template/audit_policy/full_context)
 5. Token/char limits to avoid context overflow
 6. Structured audit_policy loading with metadata
 7. JSON parsing helper
 8. comments_context support
"""

import json
import logging
import os
import difflib
from typing import Any, Dict, List, Optional, Tuple
from pathlib import Path

from dotenv import load_dotenv

from document_pipeline import DocLoader, SectionParser, MilvusVectorStore, EmbeddingService
from contract_analysis import LLMClient, _download_contract, _detect_language
from prompts import get_full_context_analysis_prompt, get_full_context_review_prompt
from ai_utils import reset_usage_stats, get_usage_report

logger = logging.getLogger(__name__)

# Limits
MAX_CONTRACT_CHARS = 80_000   # ~20K tokens
MAX_CONTEXT_CHARS  = 40_000   # ~10K tokens


def _safe_parse_llm_json(raw: str) -> list:
    """Strip codeblock wrappers and parse JSON from LLM response."""
    text = raw.strip()
    if text.startswith("```json"):
        text = text[7:]
    if text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    try:
        result = json.loads(text.strip(), strict=False)
        return result if isinstance(result, list) else []
    except Exception as e:
        logger.error(f"Failed to parse LLM JSON: {e}")
        return []


def _should_include_risk(summary: str, original: str, suggested: str) -> bool:
    """Filter out empty or placeholder findings."""
    if not summary and not original:
        return False
    if original and original.strip() in ("(Missing Clause)", ""):
        return True  # Missing clause is valid
    return True


def _compute_template_diff(
    template_text: str,
    contract_text: str,
    context_lines: int = 2,
) -> Tuple[str, int]:
    """
    Compute a structured diff report between Template and Agreement.
    Returns (diff_report_text, num_changes).
    """
    template_lines = template_text.splitlines()
    contract_lines = contract_text.splitlines()

    matcher = difflib.SequenceMatcher(None, template_lines, contract_lines)
    diff_entries: list[str] = []
    change_count = 0

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            continue

        change_count += 1
        ctx_before_start = max(0, i1 - context_lines)

        context_before = ""
        if ctx_before_start < i1:
            before_lines = template_lines[ctx_before_start:i1]
            context_before = "\n".join(f"  {line}" for line in before_lines)

        if tag == "replace":
            template_block = "\n".join(template_lines[i1:i2])
            contract_block = "\n".join(contract_lines[j1:j2])
            entry = f"--- Thay doi #{change_count} (dong ~{i1+1}-{i2}) ---\n"
            if context_before:
                entry += f"[Ngu canh truoc]:\n{context_before}\n"
            entry += f"[Template goc]:\n{template_block}\n[Agreement hien tai]:\n{contract_block}"
        elif tag == "delete":
            template_block = "\n".join(template_lines[i1:i2])
            entry = f"--- Xoa #{change_count} (dong ~{i1+1}-{i2}) ---\n"
            if context_before:
                entry += f"[Ngu canh truoc]:\n{context_before}\n"
            entry += f"[Template goc (BI XOA trong Agreement)]:\n{template_block}"
        elif tag == "insert":
            contract_block = "\n".join(contract_lines[j1:j2])
            entry = f"--- Them moi #{change_count} (dong ~{j1+1}-{j2}) ---\n"
            if context_before:
                entry += f"[Ngu canh truoc]:\n{context_before}\n"
            entry += f"[Agreement THEM MOI (khong co trong Template)]:\n{contract_block}"
        else:
            continue

        diff_entries.append(entry)

    if not diff_entries:
        return "", 0

    header = (
        f"=== BAO CAO DOI CHIEU TEMPLATE (Tong: {change_count} thay doi) ===\n"
        f"Duoi day la TAT CA cac diem khac biet giua Template chuan va Agreement hien tai.\n"
        f"Moi thay doi can duoc danh gia xem co mang rui ro hay khong.\n\n"
    )

    return header + "\n\n".join(diff_entries), change_count


async def analyze_contract_full_context(
    contract_id: str,
    contract_url: str,
    language: str = "vi",
    playbook_name: Optional[str] = None,
    contract_type: str = "General Agreement",
    is_template_based: bool = False,
    template_url: Optional[str] = None,
    severity_context: str = "",
    comments_context: str = "",
) -> Dict[str, Any]:
    load_dotenv()
    reset_usage_stats()

    logger.info(f"Starting FULL CONTEXT analysis for agreement {contract_id}")

    cleanup_paths: list[Any] = []
    loader = DocLoader()

    try:
        # 1. Load Agreement Text
        contract_path = _download_contract(contract_url)
        cleanup_paths.append(contract_path)
        contract_paragraphs = loader.load(contract_path)
        contract_text = "\n".join([p.text for p in contract_paragraphs])

        if len(contract_text) > MAX_CONTRACT_CHARS:
            logger.warning(f"Agreement text truncated: {len(contract_text)} -> {MAX_CONTRACT_CHARS} chars")
            contract_text = contract_text[:MAX_CONTRACT_CHARS]

        detected_lang = _detect_language(contract_text)
        if detected_lang:
            language = detected_lang
        logger.info(f"Agreement text loaded: {len(contract_text)} chars, language={language}")

        # 2. Build Context (Template Diff + AuditPolicy)
        context_parts: list[str] = []
        risk_source = "full_context"

        # 2a. Load Template + Compute Diff
        if is_template_based and template_url:
            try:
                template_path = _download_contract(template_url)
                cleanup_paths.append(template_path)
                template_paragraphs = loader.load(template_path)
                template_text = "\n".join([p.text for p in template_paragraphs])

                template_diff_report, num_changes = _compute_template_diff(
                    template_text, contract_text
                )

                if template_diff_report:
                    context_parts.append(template_diff_report)
                    logger.info(f"Template diff computed: {num_changes} changes found ({len(template_diff_report)} chars)")
                else:
                    context_parts.append(
                        "=== DOI CHIEU TEMPLATE: Khong tim thay sai lech nao. "
                        "Agreement GIONG HET Template chuan. ==="
                    )
                    logger.info("Template diff: NO changes found")

                risk_source = "template"
            except Exception as e:
                logger.warning(f"Could not load template: {e}")

        # 2b. Load AuditPolicy — structured format
        if playbook_name and playbook_name != "General":
            try:
                embedder = EmbeddingService()
                store = MilvusVectorStore(
                    collection_name="knowledge_base",
                    embedding_dim=embedder.dimension,
                    uri=os.getenv("MILVUS_URI")
                )
                chunks = store.query_all_by_document_id(
                    playbook_name,
                    output_fields=["chunk_text", "section_id", "chunk_index", "metadata_json"],
                )

                playbook_lines: list[str] = []
                for chunk in chunks:
                    chunk_text = chunk.get("chunk_text", "").strip()
                    if not chunk_text:
                        continue

                    metadata: dict = {}
                    raw_meta = chunk.get("metadata_json", "")
                    if raw_meta:
                        try:
                            metadata = json.loads(raw_meta) if isinstance(raw_meta, str) else raw_meta
                        except json.JSONDecodeError:
                            pass

                    clause_ref = metadata.get("clause_ref", "") or metadata.get("clauseRef", "")
                    severity = metadata.get("severity", "Unknown")
                    category = metadata.get("category", "")
                    section_title = metadata.get("section_title", chunk.get("section_id", ""))

                    header_parts = []
                    if clause_ref:
                        header_parts.append(f"[Clause {clause_ref}]")
                    if severity and severity != "Unknown":
                        header_parts.append(f"[Severity: {severity}]")
                    if category:
                        header_parts.append(f"Category: {category}")
                    if section_title:
                        header_parts.append(f"/ {section_title}")

                    header = " ".join(header_parts) if header_parts else f"Rule {chunk.get('section_id', '')}"
                    playbook_lines.append(f"- {header}\n  {chunk_text}")

                if playbook_lines:
                    playbook_text = "\n\n".join(playbook_lines)
                    context_parts.append(
                        f"--- QUY DINH NOI BO (AuditPolicy '{playbook_name}') ---\n{playbook_text}"
                    )
                    logger.info(f"Loaded {len(playbook_lines)} structured audit_policy rules ({len(playbook_text)} chars)")
                    if risk_source == "full_context":
                        risk_source = "audit_policy"
            except Exception as e:
                logger.warning(f"Could not load audit_policy '{playbook_name}': {e}")

        # 2c. Build final context with truncation
        if context_parts:
            context_text = "\n\n".join(context_parts)
            if len(context_text) > MAX_CONTEXT_CHARS:
                logger.warning(f"Context text truncated: {len(context_text)} -> {MAX_CONTEXT_CHARS} chars")
                context_text = context_text[:MAX_CONTEXT_CHARS]
        else:
            context_text = "Phan tich hop dong doc lap dua tren thuc tien phap ly tot nhat."

        # 3. Stage 1: Full Context Finding Generation
        prompt_generate = get_full_context_analysis_prompt(
            contract_text=contract_text,
            context_text=context_text,
            severity_context=severity_context,
            comments_context=comments_context,
        )

        llm = LLMClient()
        logger.info("Running Stage 1: Full Context Finding Generation...")

        response = await llm.ai_client.chat_completion(
            model=llm.model,
            temperature=0.0,
            messages=[{"role": "user", "content": prompt_generate}],
        )

        raw_response = response.choices[0].message.content.strip()
        initial_risks = _safe_parse_llm_json(raw_response)
        logger.info(f"Stage 1 complete: {len(initial_risks)} findings generated")

        if not initial_risks:
            usage_report = get_usage_report()
            return {
                "contract_id": contract_id,
                "language": language,
                "sections": [],
                "section_pairs": [],
                "usage_stats": usage_report,
                "analysis_mode": "full_context",
            }

        # 4. Stage 2: Verify Findings
        logger.info("Running Stage 2: Finding Verification & Localization...")
        prompt_verify = get_full_context_review_prompt(
            contract_text=contract_text,
            analysis_results_json=json.dumps(initial_risks, ensure_ascii=False, indent=2)
        )

        verify_response = await llm.ai_client.chat_completion(
            model=llm.model,
            temperature=0.0,
            messages=[{"role": "user", "content": prompt_verify}],
        )

        raw_verify = verify_response.choices[0].message.content.strip()
        verified_risks = _safe_parse_llm_json(raw_verify)
        if not verified_risks:
            verified_risks = initial_risks
        logger.info(f"Stage 2 complete: {len(verified_risks)} verified findings")

        # 5. Format output
        sections_output = []
        section_pairs = []

        for i, finding in enumerate(verified_risks):
            risk_level = str(finding.get("risk_level", "low")).strip().lower()
            if risk_level == "no_risk":
                continue

            section_id = finding.get("section_id", f"Finding-{i+1}")
            r_summary = finding.get("risk_summary", "")
            r_original = finding.get("original_text", "")
            r_suggested = finding.get("suggested_text", "")
            r_risk_type = finding.get("risk_type", "modification")

            if not _should_include_risk(r_summary, r_original, r_suggested):
                logger.debug(f"Filtered out low-quality finding: {section_id}")
                continue

            sections_output.append({
                "section_id": section_id,
                "title": "",
                "content": r_original,
                "page_num": 1,
                "risk_summary": r_summary,
                "risk_level": risk_level,
                "recommendations": finding.get("recommendations", []),
                "suggested_text": r_suggested,
                "auto_fixable": finding.get("auto_fixable", False),
                "original_text": r_original,
                "risk_type": r_risk_type,
                "risk_source": risk_source,
                "risk_source_detail": str(finding.get("risk_source_detail", "")).strip(),
            })

            section_pairs.append({
                "section_id": section_id,
                "original": r_original[:200] if r_original else "",
                "suggested": r_suggested[:200] if r_suggested else "",
                "risk_level": risk_level,
                "risk_type": r_risk_type,
            })

        usage_report = get_usage_report()

        return {
            "contract_id": contract_id,
            "language": language,
            "sections": sections_output,
            "section_pairs": section_pairs,
            "usage_stats": usage_report,
            "analysis_mode": "full_context",
        }

    finally:
        for p in cleanup_paths:
            try:
                if p and hasattr(p, 'exists') and p.exists():
                    p.unlink(missing_ok=True)
            except Exception:
                pass
