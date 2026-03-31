"""
Template Matcher Service
Computes text similarity between a agreement file and a template file.
Uses TF-IDF cosine similarity (sklearn) — no LLM/API calls needed.
Falls back to Jaccard similarity if sklearn is unavailable.
"""
from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Similarity threshold: >= this value → agreement is "template-based"
TEMPLATE_THRESHOLD = 0.75


def compute_similarity(text1: str, text2: str) -> float:
    """
    Compute cosine similarity between two text strings using TF-IDF vectors.
    Returns a float between 0.0 and 1.0.
    """
    if not text1 or not text2:
        return 0.0
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity as sklearn_cos_sim
        import numpy as np

        vectorizer = TfidfVectorizer(
            analyzer='char_wb',   # character n-grams work well for Vietnamese text
            ngram_range=(3, 5),
            min_df=1,
            sublinear_tf=True,
        )
        tfidf = vectorizer.fit_transform([text1, text2])
        score = sklearn_cos_sim(tfidf[0], tfidf[1])[0][0]
        return float(np.clip(score, 0.0, 1.0))
    except ImportError:
        logger.warning("sklearn not available — falling back to Jaccard similarity")
        return _jaccard_similarity(text1, text2)
    except Exception as e:
        logger.error(f"Similarity computation failed: {e}")
        return 0.0


def _jaccard_similarity(text1: str, text2: str) -> float:
    """Simple Jaccard word-set similarity as fallback."""
    set1 = set(text1.lower().split())
    set2 = set(text2.lower().split())
    if not set1 or not set2:
        return 0.0
    intersection = len(set1 & set2)
    union = len(set1 | set2)
    return intersection / union if union else 0.0


def is_template_based(similarity_score: float) -> bool:
    """Return True when similarity >= TEMPLATE_THRESHOLD."""
    return similarity_score >= TEMPLATE_THRESHOLD
