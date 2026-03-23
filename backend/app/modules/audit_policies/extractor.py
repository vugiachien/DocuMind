from openai import OpenAI
import os
import re
from typing import Dict, Optional, List
import json

from app.services.document_parser import DocLoader, SectionParser, Chunker
from app.core.config import get_settings
from concurrent.futures import ThreadPoolExecutor, as_completed

# Regex: line that is a Markdown table data row (starts with |, not a separator like |---|)
_MD_TABLE_ROW_RE = re.compile(r'^\|(?!\s*-+\s*\|).+\|$')
_MD_TABLE_SEP_RE = re.compile(r'^\|\s*[-:]+')


class PlaybookExtractor:
    """
    Extract rules from audit_policy documents using LLM with Section Awareness.
    """

    def __init__(self):
        settings = get_settings()
        self.client = OpenAI(
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_API_BASE,
        )
        self.model = settings.OPENAI_MODEL
        # CLOUD fallback client
        self._fallback_client = (
            OpenAI(api_key=settings.OPENAI_API_KEY_CLOUD, base_url=settings.OPENAI_API_BASE_CLOUD)
            if settings.OPENAI_API_KEY_CLOUD and settings.OPENAI_API_KEY_CLOUD != settings.OPENAI_API_KEY
            else None
        )
        self.loader = DocLoader()
        self.parser = SectionParser()
        self.chunker = Chunker(max_tokens=2000) # Larger chunks for LLM context
    
    # ── Markdown-table pre-processing ────────────────────────────────────────
    @staticmethod
    def _expand_table_sections(sections) -> list:
        """
        Detect sections whose text is a Markdown table and expand each data
        row into its own Section so the chunker produces one chunk per rule.
        The header row is prepended as context for every row-section.

        Must run BEFORE the chunker (which flattens newlines via .split()).
        """
        expanded: list = []
        for section in sections:
            lines = section.text.strip().splitlines()
            
            table_start_idx = -1
            for i in range(len(lines) - 1):
                if _MD_TABLE_ROW_RE.match(lines[i].strip()) and _MD_TABLE_SEP_RE.match(lines[i+1].strip()):
                    table_start_idx = i
                    break
                    
            if table_start_idx != -1:
                header_line = lines[table_start_idx].strip()
                pre_context = "\n".join(lines[:table_start_idx]).strip()
                
                data_rows = []
                for i in range(table_start_idx + 2, len(lines)):
                    if _MD_TABLE_ROW_RE.match(lines[i].strip()):
                        data_rows.append(lines[i].strip())
                    elif lines[i].strip() == "":
                        continue
                    else:
                        break
                
                if len(data_rows) >= 1:
                    for idx, row in enumerate(data_rows, start=1):
                        row_text = f"{header_line}\n{row}"
                        if pre_context:
                            row_text = f"{pre_context}\n\n{row_text}"
                            
                        row_section = type(section)(
                            section_id=f"{section.section_id}.row{idx}",
                            heading_level=section.heading_level,
                            title=section.title,
                            text=row_text,
                            parent_id=section.parent_id,
                        )
                        expanded.append(row_section)
                    continue
            expanded.append(section)
        return expanded

    def extract_rules(self, file_content: bytes, filename: str) -> List[Dict]:
        """
        Extract rules using chunk-based approach (VTDB logic).
        """
        # 1. Parse Document
        paragraphs = self.loader.load_from_bytes(file_content, filename)
        sections = self.parser.parse(paragraphs)

        # 1b. Expand table sections into one section per data row
        sections = self._expand_table_sections(sections)
        
        all_rules = []
        
        # 2. Flatten into Chunks
        all_chunks = []
        for section in sections:
            chunks = self.chunker.chunk(section, document_id=filename)
            all_chunks.extend(chunks)
            
        print(f"DEBUG: Processed {len(all_chunks)} chunks from {len(sections)} sections in {filename}")
        
        # 3. Extract from each chunk (Parallel)
        # Reduced workers to 3 to prevent RateLimit errors and improve stability
        with ThreadPoolExecutor(max_workers=3) as executor:
            future_to_chunk = {
                executor.submit(self._extract_from_chunk, chunk): chunk 
                for chunk in all_chunks 
                if len(chunk.text) > 50 # Skip tiny chunks
            }
            
            for future in as_completed(future_to_chunk):
                chunk = future_to_chunk[future]
                try:
                    rule = future.result()
                    if rule:
                        # Enrich rule
                        if rule.get('name') == "Untitled Rule":
                            rule['name'] = chunk.metadata.get('section_title', 'General Rule')
                        # Ensure standardClause is full text if not provided or too short
                        if not rule.get('standardClause') or len(rule.get('standardClause')) < 20:
                             rule['standardClause'] = chunk.text
                             
                        all_rules.append(rule)
                except Exception as e:
                    print(f"Error processing chunk {chunk.chunk_id}: {e}")
                    
        return all_rules

    def _extract_from_chunk(self, chunk) -> Dict:
        prompt = f"""You are a legal policy analyst. Treat this entire text chunk as a SINGLE Rule/Clause.

**Context**: {chunk.metadata.get('section_title', '')}

**Text**:
{chunk.text}

Analyze and format this into a single rule object.
- **Name**: Use the Section Title if available, otherwise a short summary.
- **Standard Clause**: The full text of this rule/section (cleaned).
- **Description**: Brief summary of what this rule requires.
- **clauseRef**: Extract the clause/section number if explicitly mentioned (e.g. "1.12", "2.5", "Opt. 1/Clause 4.1"). Return null if not present.
- **acceptableDeviation**: Extract any text describing what deviations from the standard are acceptable or allowed. Return null if not present.
- **approvalLevel**: Extract the approval level required (e.g. "BOD", "FNC/LEG", "LEG", "MD"). Return null if not present.

Format (JSON):
{{
    "category": "Category name",
    "name": "Rule name",
    "description": "Explanation",
    "standardClause": "Full text...",
    "severity": "high/medium/low",
    "clauseRef": "clause number or null",
    "acceptableDeviation": "acceptable deviation text or null",
    "approvalLevel": "approval level or null"
}}
"""
        import time
        import random
        
        max_retries = 3
        base_delay = 2
        
        def _call_api(client):
            return client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a JSON extractor. Return a SINGLE JSON object."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.1,
                response_format={"type": "json_object"},
            )

        for attempt in range(max_retries):
            try:
                try:
                    response = _call_api(self.client)
                except Exception as primary_err:
                    from openai import AuthenticationError, PermissionDeniedError
                    if self._fallback_client and isinstance(primary_err, (AuthenticationError, PermissionDeniedError)):
                        import logging as _log
                        _log.getLogger(__name__).warning(
                            f"Primary API key failed ({type(primary_err).__name__}), using CLOUD fallback..."
                        )
                        response = _call_api(self._fallback_client)
                    else:
                        raise
                
                content = response.choices[0].message.content
                data = json.loads(content)
                
                # If LLM returns a list (old habit), take the first one
                if isinstance(data, list):
                    return data[0] if data else None
                
                if "rules" in data and isinstance(data["rules"], list):
                     return data["rules"][0] if data["rules"] else None
                
                return data
                    
            except Exception as e:
                if attempt < max_retries - 1:
                    sleep_time = base_delay * (2 ** attempt) + random.uniform(0, 1)
                    print(f"LLM Error on chunk {chunk.chunk_id} (Attempt {attempt+1}/{max_retries}): {e}. Retrying in {sleep_time:.2f}s...")
                    time.sleep(sleep_time)
                else:
                    print(f"LLM Error on chunk {chunk.chunk_id} (Final Attempt): {e}")
                    return None
        return None

playbook_extractor = PlaybookExtractor()
