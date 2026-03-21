from __future__ import annotations

import json
import os
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests
from dotenv import load_dotenv
import asyncio
import logging
from openai import AsyncOpenAI

from ai_utils import (
    AIClientWrapper,
    get_rate_limiter,
    get_token_tracker,
    get_usage_report,
    reset_usage_stats,
    RetryConfig,
)

logger = logging.getLogger(__name__)

from document_pipeline import DocLoader, EmbeddingService, Section, SectionParser, MilvusVectorStore
from prompts import (
    get_contract_analysis_prompt,
    get_entity_conflict_prompt,
    get_missing_clauses_prompt,
    get_template_analysis_prompt,
    get_rule_compliance_prompt,
)

import re as _re
import numpy as np




def _extract_relevant_sentence(section_text: str, hint: str = "", max_chars: int = 500) -> str:
    """
    Return the single most relevant sentence (or small group of sentences)
    from *section_text* that relates to *hint* (usually the risk_summary).

    Strategy:
    1. Split section_text into sentences.
    2. Score each sentence by keyword overlap with hint tokens.
    3. Return the top-scoring sentence (or the first two sentences if
       hint is empty), capped at *max_chars*.
    """
    if not section_text:
        return ""

    # Simple sentence splitter (handles English + Vietnamese)
    sent_re = _re.compile(r'(?<=[.!?])\s+(?=[A-ZÀ-Ỹa-z\("])')
    sentences = [s.strip() for s in sent_re.split(section_text) if s.strip()]

    if not sentences:
        return section_text[:max_chars]

    if not hint or len(sentences) == 1:
        # No hint or single sentence — return first sentence capped
        return sentences[0][:max_chars]

    # Tokenise hint into lowercase words (stop-word-free scoring)
    STOP = {"the", "a", "an", "of", "in", "is", "are", "was", "were",
            "to", "and", "or", "for", "with", "that", "this", "on",
            "at", "by", "from", "be", "as", "not", "có", "của", "và",
            "là", "được", "trong", "theo", "các", "về", "cho", "với"}
    hint_tokens = set(
        w.lower().strip(".,;:\"'()[]")
        for w in hint.split()
        if w.lower().strip(".,;:\"'()[]") not in STOP and len(w) > 2
    )

    best_score = -1
    best_idx = 0
    for i, sent in enumerate(sentences):
        sent_tokens = set(
            w.lower().strip(".,;:\"'()[]")
            for w in sent.split()
        )
        score = len(hint_tokens & sent_tokens)
        if score > best_score:
            best_score = score
            best_idx = i

    # If overlap is zero, fall back to first sentence
    if best_score == 0:
        return sentences[0][:max_chars]

    # Return best sentence (and optionally the next one for context)
    result = sentences[best_idx]
    if len(result) < max_chars // 2 and best_idx + 1 < len(sentences):
        result = result + " " + sentences[best_idx + 1]

    return result[:max_chars]



@dataclass
class RuleMatch:
    chunk_id: str
    document_id: str
    section_id: str
    score: float
    metadata: Dict[str, Any]


class ContractAnalysisError(Exception):
    """Raised when agreement analysis cannot be completed."""

class LLMClient:
    """
    Client for interacting with OpenAI API to perform agreement finding analysis.
    Uses RAG (Retrieval-Augmented Generation) context from Milvus.
    
    Features:
    - Rate limiting (respects OpenAI's RPM/TPM limits)
    - Token usage tracking
    - Automatic retry with exponential backoff
    """
    def __init__(self, model: str = None):
        load_dotenv()
        from ai_utils import get_openai_config, get_cloud_openai_config
        api_key, base_url, default_model = get_openai_config()
        cloud_key, cloud_base_url, _ = get_cloud_openai_config()
        if not api_key:
            raise ContractAnalysisError("No OpenAI API key configured (set OPENAI_API_KEY_OAUTH or OPENAI_API_KEY_CLOUD)")

        # Use the wrapper with rate limiting, retry, tracking, and CLOUD fallback
        self.ai_client = AIClientWrapper(
            api_key=api_key,
            base_url=base_url,
            retry_config=RetryConfig(
                max_retries=3,
                base_delay=1.0,
                max_delay=60.0,
            ),
            fallback_api_key=cloud_key if cloud_key and cloud_key != api_key else None,
            fallback_base_url=cloud_base_url,
        )
        self.model = model or default_model
        self.logger = logging.getLogger("contract_analysis.llm")

    async def analyze(self, section: Section, matches: List[RuleMatch], contract_type: str = "General Agreement", severity_context: str = "") -> Dict[str, Any]:
        # Fast check: Skip Signature/Representative sections
        if self._is_signature_section(section):
            self.logger.info(f"Skipping analysis for signature section: {section.title}")
            return {
                "risk_summary": "Thông tin đại diện/ký kết - Không yêu cầu phân tích rủi ro.",
                "risk_level": "low",
                "recommendations": [],
                "suggested_text": "",
                "auto_fixable": False,
                "original_text": section.text
            }

        # Format rules with Severity if available
        rules_context = []
        for match in matches:
            # Metadata might contain 'severity' if we improved ingestion, or just rely on text
            severity = match.metadata.get('severity', 'Unknown')
            # If severity is generic, try to find it in text (future improvement)
            
            rule_str = (
                f"- Rule from {match.document_id} ({match.metadata.get('section_title')}):\n"
                f"  Summary: {match.metadata.get('summary', 'Refer to matched chunk text.')}\n"
                f"  Severity: {severity}\n"
                f"  Content: {match.metadata.get('text', '')}" # In case we have it, else chunk text is not in metadata usually
            )
            rules_context.append(rule_str)
            
        rules_text = "\n".join(rules_context) or "No relevant internal rules found."
        
        prompt = get_contract_analysis_prompt(
            contract_type=contract_type,
            section_title=section.title,
            section_id=section.section_id,
            section_text=section.text,
            rules_text=rules_text,
            comments_text="\n".join([f"> Ghi chú/Comment kèm theo: \"{c}\"" for c in section.comments]) if section.comments else "",
            severity_context=severity_context,
        )
        try:
            # Use the wrapper with built-in rate limiting, retry, and tracking
            response = await self.ai_client.chat_completion(
                model=self.model,
                temperature=0,
                messages=[
                    {"role": "system", "content": "Bạn là một chuyên gia phân tích pháp lý chuyên đánh giá rủi ro hợp đồng."},
                    {"role": "user", "content": prompt},
                ],
            )
            content = response.choices[0].message.content.strip()
            self.logger.debug("LLM prompt: %s", prompt)
            self.logger.debug("LLM response: %s", content)
            if content.startswith("```"):
                content = content.replace("```json", "").replace("```JSON", "").replace("```", "").strip()
            parsed = json.loads(content, strict=False)
            self.logger.info(
                f"✅ Section '{section.section_id}' analyzed → risk_level={parsed.get('risk_level', 'N/A')}"
            )
        except Exception as e:
            self.logger.error(f"LLM Error or Parse Error: {e}")
            parsed = {
                "risk_summary": f"Lỗi phân tích: {str(e)}", 
                "risk_level": "medium", 
                "recommendations": [], 
                "suggested_text": "",
                "auto_fixable": False
            }
        
        # Default values and placeholder logic (Same as before)
        if "recommendations" not in parsed: parsed["recommendations"] = []
        if "risk_level" not in parsed: parsed["risk_level"] = "medium"
        if "suggested_text" not in parsed: parsed["suggested_text"] = ""
        
        suggested_text = parsed.get("suggested_text", "")
        original_text_from_llm = parsed.get("original_text", "")

        # Smarter placeholder detection:
        # Check original_text (what's actually in the agreement) — are there still literal
        # unfilled placeholders like [location], [name]?
        # If the agreement already replaced [name] with 'Smart Agreement', that's NOT a problem.
        unfilled_in_contract = self._find_unfilled_placeholders(original_text_from_llm)
        unfilled_in_suggestion = self._find_unfilled_placeholders(suggested_text)

        has_unfilled_placeholder = bool(unfilled_in_contract or unfilled_in_suggestion)

        if "auto_fixable" not in parsed:
            parsed["auto_fixable"] = bool(suggested_text and len(suggested_text) > 10 and not has_unfilled_placeholder)

        if has_unfilled_placeholder:
            parsed["auto_fixable"] = False
            placeholders_list = list(set(unfilled_in_contract + unfilled_in_suggestion))
            placeholder_str = ", ".join(f"[{p}]" for p in placeholders_list)
            warning_msg = (
                f"⚠️ Manual review required: Phát hiện placeholder chưa được điền hoặc điền thiếu rõ ràng: "
                f"{placeholder_str}. Vui lòng kiểm tra và thay thế bằng giá trị cụ thể."
            )
            if "⚠️" not in str(parsed.get("recommendations", [])):
                parsed.setdefault("recommendations", []).insert(0, warning_msg)
            parsed["risk_level"] = parsed.get("risk_level", "medium")
            self.logger.info(f"Unfilled placeholders detected: {placeholder_str}, setting auto_fixable=False")
        
        return parsed
    
    def _is_signature_section(self, section: Section) -> bool:
        """
        Detect if a section is likely a signature block or representative listing.
        """
        text = section.text.strip().upper()
        title = section.title.strip().upper()
        
        # KEYWORDS for detection
        # Keywords that strongly indicate a signature/representative block in the TITLE
        TITLE_KEYWORDS = [
            "ĐẠI DIỆN", "REPRESENTATIVE",
            "CHỮ KÝ", "SIGNATURE", "KÝ TÊN",
            "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
        ]
        # "BÊN A/B" appear in normal agreement clauses (e.g. "Bên A có nghĩa vụ...").
        # Only use them as a signal when the ENTIRE section is very short (pure rep block).
        BODY_ONLY_KEYWORDS = [
            "BÊN A", "PARTY A",
            "BÊN B", "PARTY B",
        ]

        # 1. Title match — high confidence
        for kw in TITLE_KEYWORDS:
            if kw in title:
                return True

        # 2. Very short section + any keyword → likely a pure signature/rep block
        if len(text) < 200:
            for kw in TITLE_KEYWORDS + BODY_ONLY_KEYWORDS:
                if kw in text:
                    return True

        return False

    def _find_unfilled_placeholders(self, text: str) -> list:
        """
        Returns a list of placeholder names still in a text that look genuinely unfilled.
        A placeholder like [name], [location], [date], [amount] is considered unfilled
        if it still appears literally in the text (i.e. the user has not replaced it with
        actual content).

        We intentionally SKIP:
        - Markdown-style references like [07], [1], [2] (pure numbers)
        - Short abbreviations that may have a different meaning
        """
        import re
        if not text:
            return []
        # Match [word1 word2 ...] where content is 3+ chars and not a pure number / date
        pattern = r'\[([a-zA-Z][a-zA-Z0-9 _/]{2,})\]'
        matches = re.findall(pattern, text)
        # Filter out numeric-only or very generic technical brackets
        return [m for m in matches if not m.strip().isdigit()]

    async def detect_entity_conflict(self, full_text: str) -> Optional[Dict[str, Any]]:
        """
        Check for Critical Entity Errors (e.g., Party A matches Party B).
        """
        try:
            # Only check first 3000 chars covers headers
            text_head = full_text[:3000]
            prompt = get_entity_conflict_prompt(text_head)
            
            response = await self.ai_client.chat_completion(
                model=self.model,
                temperature=0,
                messages=[
                    {"role": "system", "content": "Bạn là chuyên gia kiểm toán hợp đồng."},
                    {"role": "user", "content": prompt},
                ],
            )
            content = response.choices[0].message.content.strip()
            if content.startswith("```"):
                content = content.replace("```json", "").replace("```", "")
            
            parsed = json.loads(content, strict=False)
            if parsed.get("has_error"):
                return {
                    "section_id": "CRITICAL_ENTITY",
                    "title": "KIỂM TRA THÔNG TIN CÁC BÊN",
                    "content": text_head[:500] + "...",
                    "original_text": text_head[:500] + "...",
                    "matched_rules": [],
                    "risk_summary": parsed.get("summary"),
                    "risk_level": "high",
                    "recommendations": [parsed.get("recommendation")],
                    "suggested_text": "",
                    "auto_fixable": False,
                    "risk_type": "modification"
                }
            return None
        except Exception as e:
            self.logger.error(f"Entity check failed: {e}")
            return None


    
    async def detect_missing_clauses(self, sections: List[Section], contract_type: str, language: str = "vi") -> List[Dict[str, str]]:
        """
        Analyze the global structure of the agreement to detect missing standard clauses.
        """
        # 1. Build Table of Contents (TOC)
        toc = [f"{sec.section_id}: {sec.title}" for sec in sections if sec.heading_level <= 2]
        toc_text = "\n".join(toc)
        
        prompt = get_missing_clauses_prompt(
            contract_type=contract_type,
            toc_text=toc_text,
            language=language
        )
        
        try:
            response = await self.ai_client.chat_completion(
                model=self.model,
                temperature=0,
                messages=[
                    {"role": "system", "content": "Bạn là chuyên gia pháp lý chuyên phân tích cấu trúc hợp đồng."},
                    {"role": "user", "content": prompt},
                ],
            )
            content = response.choices[0].message.content.strip()
            self.logger.debug("Missing Clause Prompt: %s", prompt)
            self.logger.debug("Missing Clause Results: %s", content)
            
            if content.startswith("```"):
                content = content.strip("`")
                if content.lower().startswith("json"):
                    content = content[4:].strip()
            
            return json.loads(content, strict=False)
        except Exception as e:
            self.logger.error(f"Error detecting missing clauses: {e}")
            return []

    async def analyze_vs_template(
        self,
        section: "Section",
        template_text: str,
        contract_type: str = "General Agreement",
        severity_context: str = "",
    ) -> Dict[str, Any]:
        """
        Compare a agreement section against its matching template section.
        Returns the same shape as analyze() so results can be handled uniformly.

        Returns low/no finding if the section matches the template well.
        Returns medium/high finding if significant deviations are found.
        """
        MAX_CHARS = 2000

        # Short-circuit: if there is no corresponding template section, don't ask
        # the LLM to compare against a blank — it produces misleading "missing clause" findings.
        # Instead, just skip this section (mark as no_risk / extra content).
        if not template_text or not template_text.strip():
            self.logger.debug(
                f"Section '{section.section_id}' has no matching template section — skipping template compare."
            )
            return {
                "risk_summary": "",
                "risk_level": "no_risk",
                "recommendations": [],
                "suggested_text": "",
                "auto_fixable": False,
                "original_text": "",
            }

        upload_excerpt = section.text[:MAX_CHARS]
        template_excerpt = template_text[:MAX_CHARS]


        prompt = get_template_analysis_prompt(
            contract_type=contract_type,
            section_title=section.title,
            upload_excerpt=upload_excerpt,
            template_excerpt=template_excerpt,
            severity_context=severity_context,
        )

        EMPTY_RESULT: Dict[str, Any] = {
            "risk_summary": "",
            "risk_level": "low",
            "recommendations": [],
            "suggested_text": "",
            "auto_fixable": False,
            "original_text": section.text,
        }

        try:
            response = await self.ai_client.chat_completion(
                model=self.model,
                temperature=0,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Bạn là một chuyên gia pháp lý cấp cao. "
                            "Hãy so sánh các điều khoản hợp đồng với mẫu chuẩn và xác định các điểm sai lệch. "
                            "Chỉ trả lời bằng định dạng JSON."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
            )
            content = response.choices[0].message.content.strip()
            if content.startswith("```"):
                content = content.replace("```json", "").replace("```", "").strip()
            parsed = json.loads(content, strict=False)
            self.logger.info(
                f"✅ Section '{section.section_id}' template-compared → risk_level={parsed.get('risk_level', 'N/A')}"
            )

            # Safety net: ensure original_text comes from the UPLOADED AGREEMENT,
            # not from the template. The LLM can confuse the two blocks.
            # If not found in section.text → clear it (empty string) so the
            # downstream empty-original filter will drop this finding rather than
            # accidentally replacing the entire section.
            parsed_orig = parsed.get("original_text", "")
            if parsed_orig and parsed_orig.strip() not in section.text:
                self.logger.warning(
                    f"original_text from LLM not found in section.text for {section.section_id}. "
                    f"Clearing original_text to prevent template/agreement swap."
                )
                parsed["original_text"] = ""  # Downstream filter will skip this finding

            parsed.setdefault("original_text", "")  # Don't default to full section — too broad
            return parsed
        except Exception as e:
            self.logger.error(f"analyze_vs_template failed for section {section.section_id}: {e}")
            return EMPTY_RESULT

    async def analyze_rule_compliance(
        self,
        rule_text: str,
        rule_metadata: Dict[str, Any],
        contract_section: "Section",
        contract_type: str = "General Agreement",
        severity_context: str = "",
    ) -> Dict[str, Any]:
        """
        Evaluate if a agreement section complies with a specific audit_policy rule.
        Direction: Rule → Agreement Section (rule-centric).
        Returns the same shape as analyze() for uniform finding handling.
        """
        MAX_CHARS = 2000
        section_excerpt = contract_section.text[:MAX_CHARS]
        rule_excerpt = rule_text[:MAX_CHARS]
        rule_severity = rule_metadata.get("severity", "Unknown")

        prompt = get_rule_compliance_prompt(
            contract_type=contract_type,
            rule_text=rule_excerpt,
            rule_severity=rule_severity,
            section_title=contract_section.title,
            section_text=section_excerpt,
            severity_context=severity_context,
        )

        EMPTY_RESULT: Dict[str, Any] = {
            "risk_summary": "",
            "risk_level": "no_risk",
            "recommendations": [],
            "suggested_text": "",
            "auto_fixable": False,
            "original_text": "",
            "risk_type": "modification",
        }

        try:
            response = await self.ai_client.chat_completion(
                model=self.model,
                temperature=0,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Bạn là một chuyên gia pháp lý cấp cao. "
                            "Hãy đánh giá xem điều khoản hợp đồng có tuân thủ quy định nội bộ hay không. "
                            "Chỉ trả lời bằng định dạng JSON."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
            )
            content = response.choices[0].message.content.strip()
            if content.startswith("```"):
                content = content.replace("```json", "").replace("```", "").strip()
            parsed = json.loads(content, strict=False)
            self.logger.info(
                f"✅ Rule compliance for '{contract_section.section_id}' → risk_level={parsed.get('risk_level', 'N/A')}"
            )

            # Safety: ensure original_text comes from the agreement section
            parsed_orig = parsed.get("original_text", "")
            if parsed_orig and parsed_orig.strip() not in contract_section.text:
                self.logger.warning(
                    f"Rule compliance: original_text not found in section '{contract_section.section_id}'. Clearing."
                )
                parsed["original_text"] = ""

            parsed.setdefault("original_text", "")
            parsed.setdefault("risk_type", "modification")
            return parsed
        except Exception as e:
            self.logger.error(f"analyze_rule_compliance failed: {e}")
            return EMPTY_RESULT

    
def _download_contract(url: str) -> Path:
    response = requests.get(url, stream=True, timeout=60)
    response.raise_for_status()

    dest = Path("contract_uploads")
    dest.mkdir(exist_ok=True)

    filename_hint = Path(url.split("?")[0]).name or "agreement.docx"
    temp_dest = dest / filename_hint
    # ensure unique file even if same name
    with tempfile.NamedTemporaryFile(delete=False, dir=dest, suffix=Path(filename_hint).suffix or ".docx") as tmp:
        for chunk in response.iter_content(chunk_size=8192):
            if chunk:
                tmp.write(chunk)
        temp_path = Path(tmp.name)
    return temp_path


def _format_matches(raw_hits) -> List[RuleMatch]:
    matches: List[RuleMatch] = []
    if not raw_hits:
        return matches
    for hit in raw_hits[0]:
        metadata_json = hit.entity.get("metadata_json")
        metadata = {}
        if isinstance(metadata_json, str):
            try:
                metadata = json.loads(metadata_json)
            except json.JSONDecodeError:
                metadata = {"raw_metadata": metadata_json}
        # Include chunk_text in metadata so LLM prompts can access rule content
        chunk_text = hit.entity.get("chunk_text", "")
        if chunk_text:
            metadata["text"] = chunk_text
        matches.append(
            RuleMatch(
                chunk_id=hit.id,
                document_id=hit.entity.get("document_id", ""),
                section_id=hit.entity.get("section_id", ""),
                score=float(hit.distance),
                metadata=metadata,
            )
        )
    return matches



def _detect_language(text: str) -> str:
    """Simple heuristic to detect agreement language from text content.
    Checks ratio of non-ASCII characters (Vietnamese diacritics, CJK, etc).
    Returns 'vi' if ratio > 5%, otherwise 'en'.
    """
    if not text:
        return "vi"
    non_ascii = sum(1 for c in text if ord(c) > 127)
    ratio = non_ascii / max(len(text), 1)
    return "vi" if ratio > 0.05 else "en"


async def analyze_contract(
    contract_id: str,
    contract_url: str,
    language: str = "vi",
    top_k_rules: int = 10,
    playbook_name: str = None,
    contract_type: str = "General Agreement",
    is_template_based: bool = False,
    template_url: Optional[str] = None,
    severity_doc_ids: Optional[List[str]] = None,
    severity_context: str = "",
    full_context_mode: bool = False,
) -> Dict[str, Any]:
    # Ensure env vars are loaded
    load_dotenv()
    
    if full_context_mode:
        from full_context_analysis import analyze_contract_full_context
        return await analyze_contract_full_context(
            contract_id=contract_id,
            contract_url=contract_url,
            language=language,
            playbook_name=playbook_name,
            contract_type=contract_type,
            is_template_based=is_template_based,
            template_url=template_url,
            severity_context=severity_context
        )

    # Reset usage stats at the start of analysis to get per-agreement accuracy
    reset_usage_stats()

    # ── TEMPLATE BRANCH: compare agreement against template ─────
    if is_template_based and template_url:
        try:
            return await analyze_contract_from_template(
                contract_id=contract_id,
                contract_url=contract_url,
                template_url=template_url,
                language=language,
                contract_type=contract_type,
                playbook_name=playbook_name,
                severity_context=severity_context,
            )
        except Exception as e:
            logger.warning(
                f"⚠️ Template analysis failed, falling back to standard RAG: {e}"
            )
            # Fall through to standard analysis below
    
    contract_path = _download_contract(contract_url)
    cleanup_path: Optional[Path] = contract_path

    loader = DocLoader()
    parser = SectionParser()
    embedder = EmbeddingService()
    
    # Initialize vector store
    store = MilvusVectorStore(
        collection_name="knowledge_base", 
        embedding_dim=embedder.dimension,
        uri=os.getenv("MILVUS_URI")
    )
    llm = LLMClient()

    try:
        paragraphs = loader.load(contract_path)
        sections = parser.parse(paragraphs)

        # ---------------------------------------------------------
        # AUTO-DETECT LANGUAGE from agreement content
        # ---------------------------------------------------------
        sample_text = "\n".join([p.text for p in paragraphs[:20]])
        detected_lang = _detect_language(sample_text)
        if language == "vi" and detected_lang == "en":
            language = "en"
            logger.info(f"🌐 Auto-detected agreement language: ENGLISH (overriding default 'vi')")
        else:
            logger.info(f"🌐 Agreement language: {language}")

        # Prepare tasks for parallel execution
        analysis_tasks = []
        valid_sections = []
        
        # ---------------------------------------------------------
        # PHASE 0: ENTITY CHECK (Sanity Check)
        # ---------------------------------------------------------
        # Phase 0
        full_text_start = "\n".join([p.text for p in paragraphs[:10]]) # First 10 paragraphs usually contain headers
        logger.info(f"Parsed {len(sections)} sections. Running entity check...")
        entity_error = await llm.detect_entity_conflict(full_text_start)
        
        # Bug fix: preserve entity_error before analysis_results is reset below
        entity_results: list = []
        if entity_error:
            entity_results.append(entity_error)
        
        # Prepare Filter Expression for Milvus
        # Filter by document_id (which is audit_policy name)
        filter_expr = None
        if playbook_name and playbook_name != "General":
            # Escape quotes if necessary, though audit_policy names usually safe
            filter_expr = f"document_id == '{playbook_name}'"
            logger.info(f"🔎 Filtering rules by AuditPolicy: {playbook_name}")
        else:
            logger.info("🔎 No specific AuditPolicy filter. Using Global Search.")

        # ---------------------------------------------------------
        # PHASE 1.5: SEVERITY CONTEXT (Clause Severity Rules)
        # ---------------------------------------------------------
        # severity_context may already be provided by the worker (preferred).
        # Fallback: try to fetch from Milvus if severity_doc_ids are given.
        if severity_context:
            logger.info(f"📋 Using pre-built severity context ({len(severity_context)} chars)")
        elif severity_doc_ids:
            try:
                logger.info(f"📋 Fetching Clause Severity context from Milvus for docs: {severity_doc_ids}")
                store.collection.load()
                escaped_ids = ", ".join(f"'{did}'" for did in severity_doc_ids)
                sev_filter = f"document_id in [{escaped_ids}]"
                sev_results = store.collection.query(
                    expr=sev_filter,
                    output_fields=["document_id", "section_id", "metadata_json"],
                    limit=200,
                )
                if sev_results:
                    sev_texts = []
                    for hit in sev_results:
                        metadata = {}
                        raw_meta = hit.get("metadata_json", "")
                        if raw_meta:
                            try:
                                metadata = json.loads(raw_meta)
                            except json.JSONDecodeError:
                                pass
                        title = metadata.get("section_title", hit.get("section_id", ""))
                        summary = metadata.get("summary", "")
                        text = metadata.get("text", summary)
                        if text:
                            sev_texts.append(f"- {title}: {text}")
                    severity_context = "\n".join(sev_texts)
                    logger.info(f"📋 Loaded {len(sev_texts)} severity rules from Milvus ({len(severity_context)} chars)")
                else:
                    logger.warning("📋 No severity chunks found in Milvus for given doc IDs.")
            except Exception as e:
                logger.warning(f"📋 Failed to fetch severity context from Milvus: {e}")

        for section in sections:
            text = section.text.strip()
            if not text:
                continue
            
            # Semantic search with Filter
            try:
                search_results = store.search(
                    text, 
                    embedder, 
                    limit=top_k_rules, 
                    filter_expression=filter_expr
                )
                matches = _format_matches(search_results)
            except Exception as e:
                logger.error(f"Milvus search failed: {e}")
                matches = []
            
            valid_sections.append((section, matches))
            analysis_tasks.append(llm.analyze(section, matches, contract_type=contract_type, severity_context=severity_context))

        # Build results starting with entity errors (must not be overwritten)
        analysis_results = list(entity_results)
        section_pairs_debug: list = []
        if not analysis_tasks:
             pass  # nothing more to add from LLM
        else:
             logger.info(f"🚀 Starting parallel LLM analysis for {len(analysis_tasks)} sections...")
             llm_results = await asyncio.gather(*analysis_tasks, return_exceptions=True)
             errors = sum(1 for r in llm_results if isinstance(r, Exception))
             logger.info(f"📊 LLM analysis complete: {len(llm_results)} sections, {errors} errors")
             for (section, matches), result in zip(valid_sections, llm_results):
                if isinstance(result, Exception):
                    # Handle individual task failure
                    analyzed_data = {
                        "risk_summary": f"Analysis failed: {str(result)}",
                        "risk_level": "medium",
                        "recommendations": [],
                        "suggested_text": "",
                        "auto_fixable": False,
                        "original_text": section.text
                    }
                else:
                    analyzed_data = result
                    if "original_text" not in analyzed_data:
                        analyzed_data["original_text"] = section.text

                # Handle empty dashes and edge cases where AI returns empty summaries instead of 'no_risk'
                r_level = analyzed_data.get("risk_level", "no_risk").lower().strip()
                r_summary = str(analyzed_data.get("risk_summary", "")).strip()

                is_empty_summary = (r_summary == "" or r_summary == "-" or r_summary.lower() == "none")
                
                r_original_text = str(analyzed_data.get("original_text", "")).strip()
                r_risk_type = str(analyzed_data.get("risk_type", "modification")).strip()
                is_empty_original = (r_original_text == "" or r_original_text == "-")
                r_suggested_text = str(analyzed_data.get("suggested_text", "")).strip()
                is_empty_suggested = (r_suggested_text == "" or r_suggested_text == "-")

                # Only include elements that actually have findings
                # Skip if: no finding level, empty summary, empty original_text, or empty suggested_text (unless recommendation)
                has_risk = False
                if r_level != "no_risk" and not is_empty_summary and (not is_empty_original or r_risk_type == "recommendation") and (not is_empty_suggested or r_risk_type == "recommendation"):
                    has_risk = True
                    analysis_results.append(
                        {
                            "section_id": section.section_id,
                            "title": section.title,
                            "content": section.text,
                            "original_text": analyzed_data.get("original_text", section.text),
                            "matched_rules": [
                                {
                                    "chunk_id": match.chunk_id,
                                    "document_id": match.document_id,
                                    "section_id": match.section_id,
                                    "score": match.score,
                                    "metadata": match.metadata,
                                }
                                for match in matches
                            ],
                            "risk_summary": analyzed_data.get("risk_summary", ""),
                            "risk_level": analyzed_data.get("risk_level", "medium"),
                            "confidence_score": analyzed_data.get("confidence_score", 50),
                            "recommendations": analyzed_data.get("recommendations", []),
                            "suggested_text": analyzed_data.get("suggested_text", ""),
                            "auto_fixable": analyzed_data.get("auto_fixable", False),
                            "risk_type": analyzed_data.get("risk_type", "modification")
                        }
                    )

                # Build debug section pair entry (agreement section ↔ matched rules)
                top_score = max((m.score for m in matches), default=0.0) if matches else 0.0
                match_strategy = f"milvus_rag(top_score={top_score:.2f}, rules={len(matches)})" if matches else "no_rules_matched"
                matched_rules_text = "\n".join(
                    f"[{m.document_id}] (score={m.score:.3f}) {m.metadata.get('text', '')[:200]}"
                    for m in matches[:5]  # top 5 matches
                ) if matches else ""
                section_pairs_debug.append({
                    "contract_section_id": section.section_id,
                    "contract_title": section.title,
                    "contract_text_preview": section.text,
                    "template_text_preview": matched_rules_text,  # reuse same field name for UI compatibility
                    "match_strategy": match_strategy,
                    "has_risk": has_risk,
                    "risk_level": r_level if has_risk else "no_risk",
                    "risk_summary": r_summary if has_risk else "",
                })

                logger.info(f"Section {section.section_id} analyzed. Found {len(analyzed_data.get('recommendations', []))} issues. Finding: {analyzed_data.get('risk_level')}")

        # ---------------------------------------------------------
        # PHASE 5: Detect Missing Clauses (Global Structure Check)
        # ---------------------------------------------------------
        try:
            # Use dynamic agreement type
            missing_clauses = await llm.detect_missing_clauses(sections, contract_type=contract_type, language=language)
            
            # Map missing clauses to "Recommendation" Findings
            is_en = language.lower() == "en"
            for missing in missing_clauses:
                missing_item = missing.get('missing_item', '')
                anchor = missing.get('anchor_id', '')
                reason = missing.get('reason', '')

                # Dynamic title/summary based on detected language
                title = "Missing Clause" if is_en else "Mục còn thiếu"
                risk_summary = (
                    f"Missing critical clause: {missing_item}"
                    if is_en else
                    f"Thiếu điều khoản quan trọng: {missing_item}"
                )

                # Build recommendation with insertion point
                if is_en:
                    rec = f"Based on standard {contract_type}, the document is missing '{missing_item}'. {reason}"
                    if anchor:
                        rec += f" Suggested insertion point: after section '{anchor}'."
                else:
                    rec = f"Dựa trên chuẩn {contract_type}, văn bản đang thiếu mục '{missing_item}'. {reason}"
                    if anchor:
                        rec += f" Vị trí đề xuất chèn: sau mục '{anchor}'."

                analysis_results.append({
                    "section_id": f"MISSING (after {anchor})" if anchor else "MISSING",
                    "title": title,
                    "content": "",
                    "original_text": "",
                    "matched_rules": [],
                    "risk_summary": risk_summary,
                    "risk_level": missing.get("severity", "medium"),
                    "confidence_score": 60,
                    "recommendations": [rec],
                    "suggested_text": missing.get('standard_content', ''),
                    "auto_fixable": False,
                    "risk_type": "recommendation"
                })
        except Exception as e:
            # Non-blocking error for missing clause detection
            logging.getLogger("contract_analysis").error(f"Missing clause detection failed: {e}")

        # Log token usage summary
        usage_report = get_usage_report()
        logger.info(
            f"📊 Token Usage Summary for agreement {contract_id}:\n"
            f"   ├─ Total Requests    : {usage_report['total_requests']}\n"
            f"   ├─ Total Errors      : {usage_report['total_errors']}\n"
            f"   ├─ Prompt Tokens     : {usage_report['prompt_tokens']}\n"
            f"   ├─ Completion Tokens : {usage_report['completion_tokens']}\n"
            f"   ├─ Total Tokens      : {usage_report['total_tokens']}\n"
            f"   ├─ Estimated Cost    : ${usage_report['estimated_cost_usd']:.6f}\n"
            f"   └─ Model Breakdown   : {usage_report['model_breakdown']}"
        )
        
        return {
            "contract_id": contract_id,
            "language": language,
            "sections": analysis_results,
            "usage_stats": usage_report,  # Include usage stats in response
            "analysis_mode": "playbook_rag",
            "section_pairs": section_pairs_debug,  # Debug: agreement↔rules mapping
        }
    finally:
        if cleanup_path and cleanup_path.exists():
            try:
                cleanup_path.unlink()
            except OSError:
                pass


# ──────────────────────────────────────────────────────────────
# RULE → AGREEMENT SECTION MATCHING (for Template Branch)
# ──────────────────────────────────────────────────────────────

async def match_rules_to_contract_sections(
    contract_sections: List[Section],
    playbook_name: str,
    embedder: EmbeddingService,
    store: MilvusVectorStore,
    top_k: int = 3,
) -> List[Dict[str, Any]]:
    """
    Rule-centric matching: for each agreement section, search Milvus for
    the most relevant audit_policy rule chunks (filtered by playbook_name).

    Uses the same vector search approach as Branch B's RAG flow.
    Returns a list of {rule_title, rule_section_id, matched_section, score, metadata}
    pairs where each agreement section is matched to its best rule.
    """
    if not playbook_name or playbook_name == "General":
        return []

    valid_sections = [s for s in contract_sections if s.text.strip()]
    if not valid_sections:
        return []

    filter_expr = f"document_id == '{playbook_name}'"
    logger.info(f"📋 Searching rules from audit_policy '{playbook_name}' for {len(valid_sections)} agreement sections")

    # ── For each agreement section, find matching rule chunks via Milvus search ──
    matched_pairs = []
    seen_rule_section_ids: set = set()  # Avoid duplicate rule→section pairs

    for section in valid_sections:
        try:
            search_results = store.search(
                query=section.text[:1000],  # Cap text for embedding
                embedder=embedder,
                limit=top_k,
                filter_expression=filter_expr,
                output_fields=["document_id", "section_id", "metadata_json"],
            )

            if not search_results or not search_results[0]:
                continue

            for hit in search_results[0]:
                score = float(hit.distance)
                rule_section_id = hit.entity.get("section_id", "")

                # Skip low-similarity matches
                if score < 0.35:
                    continue

                # Deduplicate: skip if this rule was already matched to a section
                # (keep the highest-scoring match per rule)
                pair_key = f"{rule_section_id}::{section.section_id}"
                if pair_key in seen_rule_section_ids:
                    continue
                seen_rule_section_ids.add(pair_key)

                # Parse metadata
                metadata = {}
                raw_meta = hit.entity.get("metadata_json", "")
                if raw_meta:
                    try:
                        metadata = json.loads(raw_meta) if isinstance(raw_meta, str) else raw_meta
                    except json.JSONDecodeError:
                        pass

                rule_title = metadata.get("section_title", f"Rule {rule_section_id}")
                chunk_text = hit.entity.get("chunk_text", "")

                matched_pairs.append({
                    "rule_text": chunk_text or f"[Rule: {rule_title}]",  # Actual rule content from Milvus
                    "rule_section_id": rule_section_id,
                    "rule_metadata": metadata,
                    "matched_section": section,
                    "score": score,
                })
                logger.info(
                    f"  Section '{section.section_id}' ({section.title}) ← Rule '{rule_title}' "
                    f"(score={score:.3f})"
                )

        except Exception as e:
            logger.warning(f"  Search failed for section '{section.section_id}': {e}")
            continue

    # Deduplicate: keep only the best match per (rule_section_id)
    best_by_rule: Dict[str, Dict] = {}
    for pair in matched_pairs:
        rsid = pair["rule_section_id"]
        if rsid not in best_by_rule or pair["score"] > best_by_rule[rsid]["score"]:
            best_by_rule[rsid] = pair

    final_pairs = list(best_by_rule.values())
    logger.info(f"📋 Matched {len(final_pairs)} unique rules to agreement sections (from {len(matched_pairs)} raw matches)")
    return final_pairs



# ──────────────────────────────────────────────────────────────
# TEMPLATE-BASED ANALYSIS
# ──────────────────────────────────────────────────────────────

async def analyze_contract_from_template(
    contract_id: str,
    contract_url: str,
    template_url: str,
    language: str = "vi",
    contract_type: str = "General Agreement",
    playbook_name: Optional[str] = None,
    severity_context: str = "",
) -> Dict[str, Any]:
    """
    Template-based analysis: instead of Milvus/AuditPolicy RAG,
    compare each section of the uploaded agreement against the matching section
    in the template DOCX and ask the LLM to identify deviations.

    Versioning context:
      v0.0 = template baseline
      v0.1 = uploaded agreement  (this is what we analyze)
    """
    from difflib import SequenceMatcher

    logger.info(f"📌 Template-based analysis started for agreement {contract_id}")

    contract_path = _download_contract(contract_url)
    template_path = _download_contract(template_url)
    cleanup: list = [contract_path, template_path]

    loader = DocLoader()
    embedder = EmbeddingService()
    # BUG-1 FIX: Use SEPARATE parser instances so _last_numbered_level
    # state doesn't bleed from agreement parsing into template parsing
    contract_parser = SectionParser()
    template_parser = SectionParser()
    llm = LLMClient()

    try:
        # Parse both documents into sections with independent parsers
        contract_paragraphs = loader.load(contract_path)
        template_paragraphs = loader.load(template_path)

        contract_sections = contract_parser.parse(contract_paragraphs)
        template_sections = template_parser.parse(template_paragraphs)


        # ── Build template lookup structures ─────────────────────────────────
        # Map: normalized_title → list of template sections (handles duplicate titles)
        from collections import defaultdict

        template_by_title: Dict[str, List] = defaultdict(list)
        for ts in template_sections:
            key = ts.title.strip().lower()
            if key:
                template_by_title[key].append(ts)

        # Track how many times each title has been consumed (for ordered sub-section matching)
        title_consume_count: Dict[str, int] = defaultdict(int)

        # ── PHASE R: Rule → Agreement Section Matching (NEW) ──────────────────
        rule_risks: list = []
        rule_pairs_debug: list = []  # Debug: rule↔section matching
        if playbook_name and playbook_name != "General":
            try:
                rule_store = MilvusVectorStore(
                    collection_name="knowledge_base",
                    embedding_dim=embedder.dimension,
                    uri=os.getenv("MILVUS_URI"),
                )
                matched_pairs = await match_rules_to_contract_sections(
                    contract_sections=contract_sections,
                    playbook_name=playbook_name,
                    embedder=embedder,
                    store=rule_store,
                )

                if matched_pairs:
                    logger.info(f"🔍 Running LLM compliance check for {len(matched_pairs)} rule-section pairs")
                    rule_tasks = [
                        llm.analyze_rule_compliance(
                            rule_text=pair["rule_text"],
                            rule_metadata=pair["rule_metadata"],
                            contract_section=pair["matched_section"],
                            contract_type=contract_type,
                            severity_context=severity_context,
                        )
                        for pair in matched_pairs
                    ]
                    logger.info(f"🚀 Starting parallel rule compliance check for {len(rule_tasks)} pairs...")
                    rule_results = await asyncio.gather(*rule_tasks, return_exceptions=True)
                    r_errors = sum(1 for r in rule_results if isinstance(r, Exception))
                    logger.info(f"📊 Rule compliance complete: {len(rule_results)} pairs, {r_errors} errors")

                    for pair, result in zip(matched_pairs, rule_results):
                        if isinstance(result, Exception):
                            logger.error(f"Rule compliance check failed: {result}")
                            continue

                        r_level = result.get("risk_level", "no_risk").lower().strip()
                        r_summary = str(result.get("risk_summary", "")).strip()
                        is_empty_summary = (r_summary == "" or r_summary == "-" or r_summary.lower() == "none")
                        r_original_text = str(result.get("original_text", "")).strip()
                        r_risk_type = str(result.get("risk_type", "modification")).strip()
                        is_empty_original = (r_original_text == "" or r_original_text == "-")
                        r_suggested_text = str(result.get("suggested_text", "")).strip()
                        is_empty_suggested = (r_suggested_text == "" or r_suggested_text == "-")

                        if r_level != "no_risk" and not is_empty_summary and (not is_empty_original or r_risk_type == "recommendation") and (not is_empty_suggested or r_risk_type == "recommendation"):
                            section = pair["matched_section"]
                            rule_risks.append({
                                "section_id": section.section_id,
                                "title": section.title,
                                "content": section.text,
                                "original_text": result.get("original_text", ""),
                                "matched_rules": [{
                                    "chunk_id": "",
                                    "document_id": playbook_name,
                                    "section_id": pair["rule_metadata"].get("section_title", ""),
                                    "score": pair["score"],
                                    "metadata": pair["rule_metadata"],
                                }],
                                "risk_summary": result.get("risk_summary", ""),
                                "risk_level": result.get("risk_level", "medium"),
                                "confidence_score": result.get("confidence_score", 50),
                                "recommendations": result.get("recommendations", []),
                                "suggested_text": result.get("suggested_text", ""),
                                "auto_fixable": result.get("auto_fixable", False),
                                "risk_type": result.get("risk_type", "modification"),
                                "risk_source": "audit_policy",
                            })

                    logger.info(f"📋 Phase R complete: {len(rule_risks)} rule-based findings found")

                    # Build debug pairs for Phase R
                    for pair, result in zip(matched_pairs, rule_results):
                        if isinstance(result, Exception):
                            continue
                        section = pair["matched_section"]
                        r_lvl = result.get("risk_level", "no_risk").lower().strip()
                        r_sum = str(result.get("risk_summary", "")).strip()
                        has_r = r_lvl != "no_risk" and r_sum not in ("", "-")
                        rule_meta = pair["rule_metadata"]
                        rule_preview = (
                            f"[{rule_meta.get('severity', '?')}] "
                            f"{rule_meta.get('category', '')} / {rule_meta.get('section_title', '')}\n"
                            f"Score: {pair['score']:.3f}\n"
                            f"{pair['rule_text'][:300]}"
                        )
                        rule_pairs_debug.append({
                            "contract_section_id": section.section_id,
                            "contract_title": section.title,
                            "contract_text_preview": section.text[:500],
                            "template_text_preview": rule_preview,
                            "match_strategy": f"playbook_rule(score={pair['score']:.3f})",
                            "has_risk": has_r,
                            "risk_level": r_lvl if has_r else "no_risk",
                            "risk_summary": r_sum if has_r else "",
                            "pair_type": "rule",
                        })
            except Exception as e:
                logger.error(f"Phase R (rule matching) failed, continuing with template-only: {e}")



        # ── PHASE T: Template-based analysis (existing logic) ──────────────
        analysis_results: list = []
        tasks = []
        paired: list = []  # (contract_section, matched_template_text | None)

        for cs_idx, cs in enumerate(contract_sections):
            if not cs.text.strip():
                continue

            matched_template_text: Optional[str] = None
            match_strategy = "none"

            cs_title_norm = cs.title.strip().lower()

            # ── Strategy 1: Exact title match (ordered sub-section consumption) ──
            # When multiple template sections share the same title (e.g. 2.1, 2.2),
            # consume them in order rather than always returning the same one.
            if cs_title_norm in template_by_title:
                candidates = template_by_title[cs_title_norm]
                consume_idx = title_consume_count[cs_title_norm]
                if consume_idx < len(candidates):
                    matched_template_text = candidates[consume_idx].text
                    title_consume_count[cs_title_norm] += 1
                    match_strategy = "exact_title"

            # ── Strategy 2: Fuzzy title match (threshold 0.85, title len > 6) ──
            if not matched_template_text and len(cs.title.strip()) > 6:
                best_ratio = 0.0
                best_ts = None
                for ts in template_sections:
                    if len(ts.title.strip()) <= 6:
                        continue  # Skip very short titles like "1.", "2." — too ambiguous
                    ratio = SequenceMatcher(None, cs.title.lower(), ts.title.lower()).ratio()
                    if ratio > best_ratio:
                        best_ratio = ratio
                        best_ts = ts
                # Only use fuzzy if clearly similar (0.85 avoids "Option 1" vs "Option 2" confusion)
                if best_ratio >= 0.85 and best_ts:
                    matched_template_text = best_ts.text
                    match_strategy = f"fuzzy_title(ratio={best_ratio:.2f})"

            # ── Strategy 3: Content similarity fallback ──────────────────────
            # If titles differ but content is structurally similar (e.g. reworded section)
            if not matched_template_text and cs.text.strip():
                best_content_ratio = 0.0
                best_content_ts = None
                cs_text_sample = cs.text[:500]  # compare first 500 chars for speed
                for ts in template_sections:
                    ratio = SequenceMatcher(
                        None, cs_text_sample.lower(), ts.text[:500].lower()
                    ).ratio()
                    if ratio > best_content_ratio:
                        best_content_ratio = ratio
                        best_content_ts = ts
                if best_content_ratio >= 0.45 and best_content_ts:
                    matched_template_text = best_content_ts.text
                    match_strategy = f"content_similarity(ratio={best_content_ratio:.2f})"

            # ── Strategy 4: Guarded positional fallback ─────────────────────
            # BUG-3 FIX: Only use positional match if content has at least
            # minimal similarity (> 0.3), preventing unrelated sections
            # from being compared and generating false HIGH findings.
            if not matched_template_text:
                if cs_idx < len(template_sections):
                    candidate = template_sections[cs_idx]
                    pos_ratio = SequenceMatcher(
                        None, cs.text[:500].lower(), candidate.text[:500].lower()
                    ).ratio()
                    if pos_ratio > 0.3:
                        matched_template_text = candidate.text
                        match_strategy = f"position(idx={cs_idx},ratio={pos_ratio:.2f})"
                    else:
                        match_strategy = "no_match(position_rejected)"
                        matched_template_text = ""
                else:
                    match_strategy = "no_match"
                    matched_template_text = ""  # No template → LLM should skip

            logger.info(
                f"Section '{cs.section_id}' title='{cs.title[:40]}' → "
                f"matched by [{match_strategy}]"
            )

            paired.append((cs, matched_template_text, match_strategy))
            tasks.append(
                llm.analyze_vs_template(
                    section=cs,
                    template_text=matched_template_text,
                    contract_type=contract_type,
                    severity_context=severity_context,
                )
            )


        if tasks:
            logger.info(f"🚀 Starting parallel template analysis for {len(tasks)} sections...")
            llm_results = await asyncio.gather(*tasks, return_exceptions=True)
            t_errors = sum(1 for r in llm_results if isinstance(r, Exception))
            logger.info(f"📊 Template analysis complete: {len(llm_results)} sections, {t_errors} errors")
        else:
            llm_results = []

        section_pairs_debug: list = []

        for (cs, tmpl, strategy), result in zip(paired, llm_results):
            if isinstance(result, Exception):
                analyzed_data: Dict[str, Any] = {
                    "risk_summary": f"Analysis failed: {result}",
                    "risk_level": "medium",
                    "recommendations": [],
                    "suggested_text": "",
                    "auto_fixable": False,
                }
            else:
                analyzed_data = result

            # Handle empty dashes and edge cases
            r_level = analyzed_data.get("risk_level", "no_risk").lower().strip()
            r_summary = str(analyzed_data.get("risk_summary", "")).strip()
            is_empty_summary = (r_summary == "" or r_summary == "-" or r_summary.lower() == "none")

            r_original_text = str(analyzed_data.get("original_text", "")).strip()
            r_risk_type = str(analyzed_data.get("risk_type", "modification")).strip()
            is_empty_original = (r_original_text == "" or r_original_text == "-")
            r_suggested_text = str(analyzed_data.get("suggested_text", "")).strip()
            is_empty_suggested = (r_suggested_text == "" or r_suggested_text == "-")

            has_risk = False
            # Skip if: no finding, empty summary, empty original_text, or empty suggested_text (unless recommendation)
            if r_level != "no_risk" and not is_empty_summary and (not is_empty_original or r_risk_type == "recommendation") and (not is_empty_suggested or r_risk_type == "recommendation"):
                has_risk = True
                analysis_results.append({
                    "section_id": cs.section_id,
                    "title": cs.title,
                    "content": cs.text,
                    "original_text": r_original_text,
                    "matched_rules": [],
                    "risk_summary": analyzed_data.get("risk_summary", ""),
                    "risk_level": analyzed_data.get("risk_level", "low"),
                    "recommendations": analyzed_data.get("recommendations", []),
                    "suggested_text": analyzed_data.get("suggested_text", ""),
                    "auto_fixable": analyzed_data.get("auto_fixable", False),
                    "risk_type": r_risk_type,
                })

            section_pairs_debug.append({
                "contract_section_id": cs.section_id,
                "contract_title": cs.title,
                "contract_text_preview": cs.text,
                "template_text_preview": (tmpl or ""),
                "match_strategy": strategy,
                "has_risk": has_risk,
                "risk_level": r_level if has_risk else "no_risk",
                "risk_summary": r_summary if has_risk else "",
                "pair_type": "template",
            })


        usage_report = get_usage_report()
        logger.info(
            f"📊 Token Usage Summary (Template) for agreement {contract_id}:\n"
            f"   ├─ Total Requests    : {usage_report['total_requests']}\n"
            f"   ├─ Total Errors      : {usage_report['total_errors']}\n"
            f"   ├─ Prompt Tokens     : {usage_report['prompt_tokens']}\n"
            f"   ├─ Completion Tokens : {usage_report['completion_tokens']}\n"
            f"   ├─ Total Tokens      : {usage_report['total_tokens']}\n"
            f"   ├─ Estimated Cost    : ${usage_report['estimated_cost_usd']:.6f}\n"
            f"   └─ Model Breakdown   : {usage_report['model_breakdown']}"
        )

        # ── MERGE: rule_risks + law_risks + template_risks ────────────────
        # 3-way merge with severity-based dedup:
        #   Start with template findings, then overlay rule findings, then law findings.
        #   For each section_id, keep the highest severity result.
        merged_results = list(analysis_results)  # Start with template findings

        severity_rank = {"no_risk": 0, "low": 1, "medium": 2, "high": 3}

        def _merge_risks(existing_results: list, new_risks: list) -> list:
            """Merge new_risks into existing_results, keeping highest severity per section_id."""
            existing_ids = {r["section_id"] for r in existing_results}
            for finding in new_risks:
                sid = finding["section_id"]
                if sid in existing_ids:
                    existing = next((r for r in existing_results if r["section_id"] == sid), None)
                    if existing:
                        existing_sev = severity_rank.get(existing.get("risk_level", "no_risk").lower(), 0)
                        new_sev = severity_rank.get(finding.get("risk_level", "no_risk").lower(), 0)
                        if new_sev > existing_sev:
                            existing_results = [r for r in existing_results if r["section_id"] != sid]
                            existing_results.append(finding)
                    else:
                        existing_results.append(finding)
                else:
                    existing_results.append(finding)
                    existing_ids.add(sid)
            return existing_results

        merged_results = _merge_risks(merged_results, rule_risks)


        merge_parts = [f"{len(analysis_results)} template"]
        if rule_risks:
            merge_parts.append(f"{len(rule_risks)} rule")

        if len(merge_parts) > 1:
            logger.info(
                f"📋 Merged results: {' + '.join(merge_parts)} → {len(merged_results)} total findings"
            )

        # Mark template findings with source
        for r in merged_results:
            if "risk_source" not in r:
                r["risk_source"] = "template"

        return {
            "contract_id": contract_id,
            "language": language,
            "sections": merged_results,
            "usage_stats": usage_report,
            "analysis_mode": "template_based",
            "section_pairs": section_pairs_debug + rule_pairs_debug,  # Debug: template + rule pairs
        }
    finally:
        for p in cleanup:
            if p and p.exists():
                try:
                    p.unlink()
                except OSError:
                    pass
