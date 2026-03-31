from openai import OpenAI
import os
from typing import Dict, Optional, List
import json
from fuzzywuzzy import fuzz
from app.core.config import get_settings

class MetadataExtractor:
    """
    Extract agreement metadata (Partner, Agreement Type) from document text using LLM.
    """

    def __init__(self):
        settings = get_settings()
        self.client = OpenAI(
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_API_BASE,
        )
        self.model = settings.OPENAI_MODEL
        # CLOUD fallback client (used if primary fails with auth error)
        self._fallback_client = (
            OpenAI(api_key=settings.OPENAI_API_KEY_CLOUD, base_url=settings.OPENAI_API_BASE_CLOUD)
            if settings.OPENAI_API_KEY_CLOUD and settings.OPENAI_API_KEY_CLOUD != settings.OPENAI_API_KEY
            else None
        )
    
    def extract_metadata(
        self,
        document_text: str,
        available_partners: List[Dict[str, str]],
        available_types: List[Dict[str, str]],
        max_chars: int = 3000
    ) -> Dict[str, any]:
        """
        Extract metadata from document text using LLM.
        
        Args:
            document_text: Full text of the document
            available_partners: List of {id, name} dicts
            available_types: List of {id, name} dicts
            max_chars: Maximum characters to send to LLM (for cost optimization)
        
        Returns:
            {
                "suggested_partner_id": str | None,
                "suggested_type_id": str | None,
                "confidence": float,
                "detected_partner_name": str | None,
                "detected_type_name": str | None
            }
        """
        
        # Truncate document to first N chars for cost efficiency
        text_snippet = document_text[:max_chars]
        
        # Prepare lists for prompt
        # partner_names = [p['name'] for p in available_partners] # DISABLED
        type_info = [f"- {t['name']}: {t.get('description', '')}" for t in available_types]
        
        # LLM Prompt
        prompt = f"""You are a agreement metadata extractor. Analyze this agreement document and identify:

1. **Agreement Type**: The type of agreement, matching the provided list based on **content and purpose**, even if the title is different.

**Available Agreement Types**:
{chr(10).join(type_info)}

**Document Text (First {max_chars} characters)**:
{text_snippet}

Return ONLY a JSON object (no markdown, no extra text):
{{
  "contract_type": "Exact name from available list or closest match",
  "confidence": 0.0-1.0
}}

If you cannot determine with confidence, return null for that field."""

        def _call_api(client):
            return client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a agreement analysis expert. Return only valid JSON."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.1,
                max_tokens=200,
            )

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
            
            result_text = response.choices[0].message.content.strip()
            
            # Parse JSON
            try:
                llm_result = json.loads(result_text)
            except json.JSONDecodeError:
                # Try to extract JSON from markdown code block
                if "```json" in result_text:
                    result_text = result_text.split("```json")[1].split("```")[0].strip()
                    llm_result = json.loads(result_text)
                else:
                    raise
            
            detected_partner = None # DISABLED
            detected_type = llm_result.get("contract_type")
            confidence = llm_result.get("confidence", 0.5)
            
            # Fuzzy match to database
            partner_id = None # DISABLED
            type_id = self._fuzzy_match(detected_type, available_types) if detected_type else None
            
            return {
                "suggested_partner_id": None,
                "suggested_type_id": type_id,
                "confidence": confidence,
                "detected_partner_name": None,
                "detected_type_name": detected_type
            }
            
        except Exception as e:
            print(f"Error extracting metadata: {e}")
            return {
                "suggested_partner_id": None,
                "suggested_type_id": None,
                "confidence": 0.0,
                "detected_partner_name": None,
                "detected_type_name": None,
                "error": str(e)
            }
    
    def _fuzzy_match(self, detected_name: str, available_items: List[Dict[str, str]], threshold: int = 75) -> Optional[str]:
        """
        Fuzzy match detected name to available items.
        
        Args:
            detected_name: Name extracted by LLM
            available_items: List of {id, name} dicts
            threshold: Minimum similarity score (0-100)
        
        Returns:
            ID of best match or None
        """
        if not detected_name:
            return None
        
        best_match = None
        best_score = 0
        
        for item in available_items:
            score = fuzz.ratio(detected_name.lower(), item['name'].lower())
            if score > best_score and score >= threshold:
                best_score = score
                best_match = item['id']
        
        return best_match


# Singleton
metadata_extractor = MetadataExtractor()
