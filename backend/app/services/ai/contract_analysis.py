"""Compatibility shim for legacy imports.

The codebase was renamed from `contract_analysis` to `agreement_analysis`,
but several runtime paths still import the old module name.
"""

from .agreement_analysis import (  # noqa: F401
    ContractAnalysisError,
    LLMClient,
    RuleMatch,
    analyze_contract,
    _detect_language,
    _download_contract,
)

