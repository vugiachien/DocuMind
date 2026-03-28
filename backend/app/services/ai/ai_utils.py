"""
AI Service Utilities
- Rate limiting for OpenAI API calls
- Token usage tracking
- Retry with exponential backoff
"""
import asyncio
import logging
import os
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from functools import wraps
from typing import Any, Callable, Dict, Optional, Tuple, TypeVar

logger = logging.getLogger(__name__)


# =============================================================================
# OPENAI CONFIG WITH OAUTH → CLOUD FALLBACK
# =============================================================================

def get_openai_config() -> Tuple[str, Optional[str], str]:
    """
    Returns (api_key, base_url, model).
    Uses OAUTH as primary, falls back to CLOUD if OAUTH not configured.
    """
    oauth_key = os.getenv("OPENAI_API_KEY_OAUTH", "").strip()
    if oauth_key:
        return (
            oauth_key,
            os.getenv("OPENAI_API_BASE_OAUTH"),
            os.getenv("OPENAI_MODEL_OAUTH", "gpt-5.2"),
        )
    return (
        os.getenv("OPENAI_API_KEY_CLOUD", "").strip(),
        os.getenv("OPENAI_API_BASE_CLOUD"),
        os.getenv("OPENAI_MODEL_CLOUD", "gpt-4o-mini"),
    )


def get_cloud_openai_config() -> Tuple[str, Optional[str], str]:
    """Returns CLOUD credentials (used as fallback at request time)."""
    return (
        os.getenv("OPENAI_API_KEY_CLOUD", "").strip(),
        os.getenv("OPENAI_API_BASE_CLOUD"),
        os.getenv("OPENAI_MODEL_CLOUD", "gpt-4o-mini"),
    )

# =============================================================================
# RATE LIMITER
# =============================================================================

class RateLimiter:
    """
    Token bucket rate limiter for API calls.
    Limits both requests per minute and tokens per minute.
    Uses a Semaphore to allow concurrent requests up to max_concurrent.
    """
    
    def __init__(
        self,
        requests_per_minute: int = 60,
        tokens_per_minute: int = 200000,  # GPT-4o-mini free tier
        max_concurrent: int = 10,        # Max concurrent API calls
    ):
        self.rpm_limit = requests_per_minute
        self.tpm_limit = tokens_per_minute
        
        # Track timestamps of recent requests
        self._request_times: deque = deque()
        self._token_usage: deque = deque()  # (timestamp, tokens)
        
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._state_lock = asyncio.Lock()  # Protects internal state only (fast, no sleep)
    
    async def acquire(self, estimated_tokens: int = 1000) -> None:
        """
        Wait until rate limit allows the request.
        Uses Semaphore for concurrency control + internal lock for state tracking.
        """
        # First, wait for a concurrency slot
        await self._semaphore.acquire()
        
        try:
            # Then check rate limits (fast lock, no sleeping under lock)
            wait_time = 0.0
            async with self._state_lock:
                now = datetime.now()
                window_start = now - timedelta(minutes=1)
                
                # Clean old entries
                while self._request_times and self._request_times[0] < window_start:
                    self._request_times.popleft()
                while self._token_usage and self._token_usage[0][0] < window_start:
                    self._token_usage.popleft()
                
                # Check RPM limit
                if len(self._request_times) >= self.rpm_limit:
                    wait_time = max(wait_time, (self._request_times[0] - window_start).total_seconds() + 0.1)
                
                # Check TPM limit
                current_tokens = sum(t[1] for t in self._token_usage)
                if current_tokens + estimated_tokens > self.tpm_limit:
                    wait_time = max(wait_time, (self._token_usage[0][0] - window_start).total_seconds() + 0.1)
                
                # Record this request
                self._request_times.append(now)
                self._token_usage.append((now, estimated_tokens))
            
            # Sleep OUTSIDE the lock so other tasks can proceed
            if wait_time > 0:
                logger.warning(f"Rate limit: waiting {wait_time:.1f}s")
                await asyncio.sleep(max(0, wait_time))
        except Exception:
            self._semaphore.release()
            raise
    
    def release(self) -> None:
        """Release the semaphore slot after API call completes."""
        self._semaphore.release()
    
    def record_actual_tokens(self, prompt_tokens: int, completion_tokens: int) -> None:
        """
        Update the token usage with actual values after API response.
        Called after receiving the API response.
        """
        total = prompt_tokens + completion_tokens
        if self._token_usage:
            # Update last entry with actual tokens
            old_time, _ = self._token_usage.pop()
            self._token_usage.append((old_time, total))


# Global rate limiter instance
_rate_limiter: Optional[RateLimiter] = None

def get_rate_limiter() -> RateLimiter:
    """Get or create the global rate limiter."""
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = RateLimiter()
    return _rate_limiter


# =============================================================================
# TOKEN USAGE TRACKER
# =============================================================================

@dataclass
class TokenUsageStats:
    """Tracks token usage statistics."""
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    requests: int = 0
    errors: int = 0
    total_cost_usd: float = 0.0
    
    # Track per-model usage
    model_usage: Dict[str, Dict[str, int]] = field(default_factory=dict)
    
    # Pricing (per 1M tokens) - GPT-4o-mini as of 2026
    PRICING = {
        "gpt-4o-mini": {"input": 0.15, "output": 0.60},
        "gpt-4o": {"input": 2.50, "output": 10.00},
        "gpt-4-turbo": {"input": 10.00, "output": 30.00},
        "gpt-5.2": {"input": 0.15, "output": 0.60},
        "gpt-5.1": {"input": 0.15, "output": 0.60},
        "gpt-5": {"input": 0.15, "output": 0.60},
    }
    
    def record(self, model: str, prompt_tokens: int, completion_tokens: int) -> float:
        """
        Record token usage and return estimated cost.
        
        Returns:
            Estimated cost in USD for this request.
        """
        self.prompt_tokens += prompt_tokens
        self.completion_tokens += completion_tokens
        self.total_tokens += prompt_tokens + completion_tokens
        self.requests += 1
        
        # Track per-model
        if model not in self.model_usage:
            self.model_usage[model] = {"prompt": 0, "completion": 0, "requests": 0}
        self.model_usage[model]["prompt"] += prompt_tokens
        self.model_usage[model]["completion"] += completion_tokens
        self.model_usage[model]["requests"] += 1
        
        # Calculate cost
        pricing = self.PRICING.get(model, self.PRICING["gpt-4o-mini"])
        cost = (prompt_tokens / 1_000_000 * pricing["input"]) + \
               (completion_tokens / 1_000_000 * pricing["output"])
        self.total_cost_usd += cost
        
        return cost
    
    def record_error(self) -> None:
        """Record an API error."""
        self.errors += 1
    
    def get_summary(self) -> Dict[str, Any]:
        """Get a summary of token usage."""
        return {
            "total_requests": self.requests,
            "total_errors": self.errors,
            "total_tokens": self.total_tokens,
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "estimated_cost_usd": round(self.total_cost_usd, 4),
            "model_breakdown": self.model_usage,
        }
    
    def reset(self) -> None:
        """Reset all statistics."""
        self.prompt_tokens = 0
        self.completion_tokens = 0
        self.total_tokens = 0
        self.requests = 0
        self.errors = 0
        self.total_cost_usd = 0.0
        self.model_usage = {}


# Global token tracker instance
_token_tracker: Optional[TokenUsageStats] = None

def get_token_tracker() -> TokenUsageStats:
    """Get or create the global token tracker."""
    global _token_tracker
    if _token_tracker is None:
        _token_tracker = TokenUsageStats()
    return _token_tracker


# =============================================================================
# RETRY WITH EXPONENTIAL BACKOFF
# =============================================================================

T = TypeVar('T')

class RetryConfig:
    """Configuration for retry behavior."""
    def __init__(
        self,
        max_retries: int = 3,
        base_delay: float = 1.0,
        max_delay: float = 60.0,
        exponential_base: float = 2.0,
        retryable_exceptions: tuple = (
            Exception,  # Catch-all, customize for production
        ),
        retryable_status_codes: tuple = (429, 500, 502, 503, 504),
    ):
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.exponential_base = exponential_base
        self.retryable_exceptions = retryable_exceptions
        self.retryable_status_codes = retryable_status_codes


def retry_with_backoff(config: Optional[RetryConfig] = None):
    """
    Decorator for async functions that retries with exponential backoff.
    
    Usage:
        @retry_with_backoff()
        async def call_openai(prompt: str) -> str:
            ...
    """
    if config is None:
        config = RetryConfig()
    
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> T:
            last_exception = None
            
            for attempt in range(config.max_retries + 1):
                try:
                    return await func(*args, **kwargs)
                except config.retryable_exceptions as e:
                    last_exception = e
                    
                    # Check if it's a rate limit error (429)
                    is_rate_limit = False
                    retry_after = None
                    
                    # Handle OpenAI-specific errors
                    if hasattr(e, 'status_code'):
                        if e.status_code not in config.retryable_status_codes:
                            raise
                        is_rate_limit = e.status_code == 429
                    
                    # Check for retry-after header
                    if hasattr(e, 'response') and hasattr(e.response, 'headers'):
                        retry_after = e.response.headers.get('retry-after')
                    
                    if attempt == config.max_retries:
                        logger.error(f"Max retries ({config.max_retries}) exceeded for {func.__name__}")
                        raise
                    
                    # Calculate delay
                    if retry_after:
                        delay = float(retry_after)
                    else:
                        delay = min(
                            config.base_delay * (config.exponential_base ** attempt),
                            config.max_delay
                        )
                    
                    # Add jitter to prevent thundering herd
                    import random
                    jitter = random.uniform(0, 0.1 * delay)
                    delay += jitter
                    
                    error_type = "Rate limit" if is_rate_limit else "Error"
                    logger.warning(
                        f"{error_type} in {func.__name__} (attempt {attempt + 1}/{config.max_retries + 1}): "
                        f"{str(e)[:100]}. Retrying in {delay:.1f}s..."
                    )
                    
                    await asyncio.sleep(delay)
            
            # Should not reach here, but just in case
            raise last_exception
        
        return wrapper
    return decorator


# =============================================================================
# OPENAI CLIENT WRAPPER
# =============================================================================

class AIClientWrapper:
    """
    Wrapper around OpenAI AsyncClient with rate limiting, retry, and token tracking.
    
    Usage:
        client = AIClientWrapper(api_key="...")
        response = await client.chat_completion(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": "Hello"}]
        )
    """
    
    def __init__(
        self,
        api_key: str,
        base_url: Optional[str] = None,
        rate_limiter: Optional[RateLimiter] = None,
        token_tracker: Optional[TokenUsageStats] = None,
        retry_config: Optional[RetryConfig] = None,
        fallback_api_key: Optional[str] = None,
        fallback_base_url: Optional[str] = None,
    ):
        from openai import AsyncOpenAI

        self.client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        self.rate_limiter = rate_limiter or get_rate_limiter()
        self.token_tracker = token_tracker or get_token_tracker()
        self.retry_config = retry_config or RetryConfig()
        self.logger = logging.getLogger("ai_client")

        # Fallback client (CLOUD) used when primary (OAUTH) fails with auth error
        self.fallback_client = (
            AsyncOpenAI(api_key=fallback_api_key, base_url=fallback_base_url)
            if fallback_api_key else None
        )
    
    async def chat_completion(
        self,
        model: str,
        messages: list,
        temperature: float = 0,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Make a chat completion request with rate limiting, retry, and tracking.
        
        Returns:
            The full API response as a dict.
        """
        # Estimate tokens for rate limiting (rough estimate)
        estimated_tokens = sum(len(m.get("content", "")) // 4 for m in messages) + 500
        
        # Wait for rate limit
        await self.rate_limiter.acquire(estimated_tokens)
        
        # Build request kwargs, omitting max_tokens if None to avoid proxy issues
        req_kwargs = dict(model=model, messages=messages, temperature=temperature, **kwargs)
        if max_tokens is not None:
            req_kwargs["max_tokens"] = max_tokens

        @retry_with_backoff(self.retry_config)
        async def _make_request(client):
            response = await client.chat.completions.create(**req_kwargs)
            return response

        def _log_usage(response, active_model: str):
            usage = response.usage
            if usage:
                cost = self.token_tracker.record(
                    model=active_model,
                    prompt_tokens=usage.prompt_tokens,
                    completion_tokens=usage.completion_tokens,
                )
                self.rate_limiter.record_actual_tokens(
                    usage.prompt_tokens,
                    usage.completion_tokens,
                )
                self.logger.info(
                    f"🔤 API call [{active_model}]: prompt={usage.prompt_tokens}, "
                    f"completion={usage.completion_tokens}, "
                    f"total={usage.prompt_tokens + usage.completion_tokens} tokens, "
                    f"cost=${cost:.6f}"
                )

        try:
            response = await _make_request(self.client)
            _log_usage(response, model)
            return response

        except Exception as e:
            # If primary (OAUTH) fails with an auth error, retry with CLOUD fallback
            from openai import AuthenticationError, PermissionDeniedError
            if self.fallback_client and isinstance(e, (AuthenticationError, PermissionDeniedError)):
                self.logger.warning(
                    f"⚠️ Primary API key failed ({type(e).__name__}), switching to CLOUD fallback..."
                )
                try:
                    response = await _make_request(self.fallback_client)
                    _log_usage(response, model)
                    return response
                except Exception as fallback_err:
                    self.token_tracker.record_error()
                    raise fallback_err
            self.token_tracker.record_error()
            raise
        finally:
            self.rate_limiter.release()


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def estimate_tokens(text: str) -> int:
    """
    Rough estimation of token count for a text.
    Uses ~4 characters per token as a rough estimate.
    """
    return len(text) // 4 + 1


def get_usage_report() -> Dict[str, Any]:
    """Get a report of current token usage."""
    return get_token_tracker().get_summary()


def reset_usage_stats() -> None:
    """Reset token usage statistics."""
    get_token_tracker().reset()
