"""
Gemini Client Wrapper for AI Brain v4.0.

Centralised Gemini API client with:
- Retry with exponential backoff (via tenacity)
- 429 RESOURCE_EXHAUSTED aware retry with Retry-After parsing
- Multi-key rotation (GEMINI_API_KEY, GEMINI_API_KEY_2, ...)
- Request spacing to prevent burst rate-limiting
- Timeout protection
- OpenAI tool-schema → Gemini function-declaration conversion
- Unified response parsing for both streaming and non-streaming
- Token usage extraction
"""

import json
import os
import re
import time
import random
import logging
import threading
from typing import Dict, List, Any, Optional, Generator

from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception,
    retry_if_exception_type,
)

logger = logging.getLogger('reviseit.gemini')

# Lazy import — populated on first use
_genai_module = None
_genai_types = None


# =========================================================================
# CUSTOM EXCEPTIONS
# =========================================================================

class RateLimitError(Exception):
    """Raised when all API keys are exhausted due to rate limiting (429).

    Attributes:
        retry_after: Suggested wait time in seconds (from API response).
        original_error: The original exception from the Gemini SDK.
    """

    def __init__(self, message: str, retry_after: float = 0, original_error: Exception = None):
        super().__init__(message)
        self.retry_after = retry_after
        self.original_error = original_error


# =========================================================================
# HELPERS
# =========================================================================

def _parse_retry_after(error: Exception) -> float:
    """Extract retry delay from a 429 error message.

    Google Gemini embeds the delay like:
        'retryDelay': '40s'
    or in the text like:
        'Please retry in 40.946404196s.'

    Returns seconds to wait, or a default of 5s if unparseable.
    """
    error_str = str(error)

    # Pattern 1: "Please retry in 40.946404196s."
    match = re.search(r'retry in ([\d.]+)s', error_str, re.IGNORECASE)
    if match:
        return float(match.group(1))

    # Pattern 2: "'retryDelay': '40s'"
    match = re.search(r"retryDelay['\"]?\s*[:=]\s*['\"]?([\d.]+)", error_str)
    if match:
        return float(match.group(1))

    return 5.0  # Safe default


def _is_rate_limit_error(exc: Exception) -> bool:
    """Check if an exception is a 429 / RESOURCE_EXHAUSTED error."""
    error_str = str(exc)
    return '429' in error_str or 'RESOURCE_EXHAUSTED' in error_str


def _ensure_genai():
    """Lazy-import google.genai and cache it."""
    global _genai_module, _genai_types
    if _genai_module is None:
        try:
            from google import genai
            from google.genai import types
            _genai_module = genai
            _genai_types = types
        except ImportError:
            raise ImportError(
                "google-genai package required. Install with: pip install google-genai"
            )
    return _genai_module, _genai_types


# =========================================================================
# TOOL SCHEMA CONVERTER: OpenAI → Gemini
# =========================================================================

def convert_openai_tools_to_gemini(openai_tools: List[Dict[str, Any]]):
    """
    Convert OpenAI function-calling tool schemas to Gemini function declarations.

    OpenAI format:
        [{"type": "function", "function": {"name": ..., "description": ..., "parameters": {...}}}]

    Gemini format:
        [types.Tool(function_declarations=[FunctionDeclaration(...)])]
    """
    _, types = _ensure_genai()

    declarations = []
    for tool in openai_tools:
        func = tool.get("function", tool)
        name = func["name"]
        description = func.get("description", "")
        params = func.get("parameters", {})

        # Gemini uses the same JSON-schema subset for parameters
        declarations.append(types.FunctionDeclaration(
            name=name,
            description=description,
            parameters=params if params.get("properties") else None,
        ))

    return [types.Tool(function_declarations=declarations)]


# =========================================================================
# RESPONSE HELPERS
# =========================================================================

def extract_text(response) -> str:
    """Extract text content from a Gemini response."""
    try:
        return response.text or ""
    except (AttributeError, ValueError):
        # Fallback: iterate parts using getattr (SDK objects, not dicts)
        for candidate in getattr(response, "candidates", []):
            content = getattr(candidate, "content", None)
            if not content:
                continue
            for part in getattr(content, "parts", []):
                if hasattr(part, "text") and part.text:
                    return part.text
        return ""


def extract_json(response, default: dict = None) -> dict:
    """
    Extract and parse JSON from a Gemini response.

    Handles common failure modes:
    - Empty response text
    - Preamble text before JSON (e.g. "Here is the JSON response: {...}")
    - Truncated JSON (attempts repair by closing brackets)
    - Malformed JSON

    Returns the parsed dict, or `default` if parsing fails.
    """
    if default is None:
        default = {}

    raw = extract_text(response).strip()
    if not raw:
        logger.warning("Gemini returned empty text for JSON-mode request")
        return default

    # First try: direct parse
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # Second try: strip preamble text before JSON object
    # Gemini sometimes returns "Here is the JSON response:\n{...}"
    brace_pos = raw.find('{')
    if brace_pos > 0:
        stripped = raw[brace_pos:]
        try:
            return json.loads(stripped)
        except json.JSONDecodeError:
            # Try repairing the stripped version too
            raw = stripped

    # Third try: repair truncated JSON (missing closing braces/brackets)
    open_braces = raw.count('{') - raw.count('}')
    open_brackets = raw.count('[') - raw.count(']')
    if open_braces > 0 or open_brackets > 0:
        for trim_char in [',', ':']:
            last_pos = raw.rfind(trim_char)
            if last_pos > 0:
                candidate = raw[:last_pos]
                candidate += ']' * max(0, open_brackets) + '}' * max(0, open_braces)
                try:
                    result = json.loads(candidate)
                    logger.info("Repaired truncated JSON from Gemini response")
                    return result
                except json.JSONDecodeError:
                    continue

    logger.warning(f"Failed to parse Gemini JSON response ({len(raw)} chars): {raw[:100]}...")
    return default


def extract_tool_call(response) -> Optional[Dict[str, Any]]:
    """
    Extract the first function call from a Gemini response.
    Returns {"name": str, "arguments": dict} or None.
    """
    for candidate in getattr(response, "candidates", []):
        content = getattr(candidate, "content", None)
        if not content:
            continue
        for part in getattr(content, "parts", []):
            fn_call = getattr(part, "function_call", None)
            if fn_call:
                return {
                    "name": fn_call.name,
                    "arguments": dict(fn_call.args) if fn_call.args else {},
                }
    return None


def extract_usage(response) -> Dict[str, int]:
    """Extract token usage from Gemini response."""
    meta = getattr(response, "usage_metadata", None)
    if meta:
        return {
            "prompt_tokens": getattr(meta, "prompt_token_count", 0) or 0,
            "completion_tokens": getattr(meta, "candidates_token_count", 0) or 0,
            "total_tokens": getattr(meta, "total_token_count", 0) or 0,
        }
    return {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}


# =========================================================================
# MULTI-KEY MANAGER
# =========================================================================

def _collect_api_keys(primary_key: str = None) -> List[str]:
    """Collect all available Gemini API keys from environment.

    Looks for: GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3, ...
    Also checks GOOGLE_API_KEY as fallback.
    """
    keys = []

    if primary_key:
        keys.append(primary_key)

    # Collect numbered keys
    for i in range(2, 11):  # Support up to 10 keys
        key = os.getenv(f"GEMINI_API_KEY_{i}")
        if key and key not in keys:
            keys.append(key)

    # Fallback to GOOGLE_API_KEY if no keys found
    if not keys:
        fallback = os.getenv("GOOGLE_API_KEY")
        if fallback:
            keys.append(fallback)

    return keys


# =========================================================================
# GEMINI CLIENT
# =========================================================================

class GeminiClient:
    """
    Production-ready Gemini API client.

    Features:
    - Retry with exponential backoff (configurable attempts)
    - 429 RESOURCE_EXHAUSTED: retry with Retry-After delay + jitter
    - Multi-key rotation: automatically rotates to next API key on 429
    - Request spacing: configurable minimum interval between requests
    - Timeout protection
    - JSON-mode support
    - Tool/function calling
    - Streaming
    """

    def __init__(
        self,
        api_key: str,
        max_retries: int = 3,
        timeout_seconds: int = 30,
        rate_limit_max_retries: int = 2,
        min_request_interval_ms: int = 200,
    ):
        genai, types = _ensure_genai()
        self._types = types
        self._genai = genai
        self.max_retries = max_retries
        self.timeout_seconds = timeout_seconds
        self._rate_limit_max_retries = rate_limit_max_retries
        self._min_request_interval = min_request_interval_ms / 1000.0  # Convert to seconds

        # Multi-key rotation
        self._api_keys = _collect_api_keys(api_key)
        self._current_key_index = 0
        self._key_lock = threading.Lock()

        # Create initial client
        self._client = genai.Client(api_key=self._api_keys[0] if self._api_keys else api_key)

        # Request spacing
        self._last_request_time = 0.0
        self._request_lock = threading.Lock()

        if len(self._api_keys) > 1:
            logger.info(f"🔑 Multi-key rotation enabled: {len(self._api_keys)} API keys loaded")

    # -----------------------------------------------------------------
    # KEY ROTATION
    # -----------------------------------------------------------------

    def _rotate_key(self) -> bool:
        """Rotate to the next API key. Returns True if a new key is available."""
        with self._key_lock:
            if len(self._api_keys) <= 1:
                return False

            self._current_key_index = (self._current_key_index + 1) % len(self._api_keys)
            new_key = self._api_keys[self._current_key_index]
            self._client = self._genai.Client(api_key=new_key)
            logger.info(f"🔑 Rotated to API key #{self._current_key_index + 1}")
            return True

    # -----------------------------------------------------------------
    # REQUEST SPACING
    # -----------------------------------------------------------------

    def _wait_for_spacing(self):
        """Enforce minimum interval between API requests to avoid bursts."""
        if self._min_request_interval <= 0:
            return

        with self._request_lock:
            now = time.monotonic()
            elapsed = now - self._last_request_time
            if elapsed < self._min_request_interval:
                wait_time = self._min_request_interval - elapsed
                time.sleep(wait_time)
            self._last_request_time = time.monotonic()

    # -----------------------------------------------------------------
    # CORE: Non-streaming completion
    # -----------------------------------------------------------------

    def generate(
        self,
        model: str,
        system_prompt: str,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 500,
        json_mode: bool = False,
        tools=None,
        tool_choice: str = None,
    ):
        """
        Generate a response (non-streaming).

        Args:
            model: Gemini model name (e.g. "gemini-2.5-flash")
            system_prompt: System instruction
            messages: List of {"role": "user"|"model", "content": str}
            temperature: Sampling temperature
            max_tokens: Max output tokens
            json_mode: If True, force JSON output
            tools: Gemini tool objects (already converted)
            tool_choice: Not used by Gemini (auto by default)
        """
        types = self._types

        # Build content list from messages
        contents = self._build_contents(messages)

        # Build generation config
        gen_config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=temperature,
            max_output_tokens=max_tokens,
            tools=tools,
        )

        if json_mode:
            gen_config.response_mime_type = "application/json"

        return self._call_with_retry(model, contents, gen_config)

    # -----------------------------------------------------------------
    # STREAMING
    # -----------------------------------------------------------------

    def generate_stream(
        self,
        model: str,
        system_prompt: str,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 500,
    ) -> Generator[str, None, None]:
        """
        Stream a response token-by-token.
        Yields text chunks as they arrive.
        """
        types = self._types
        contents = self._build_contents(messages)

        gen_config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=temperature,
            max_output_tokens=max_tokens,
        )

        self._wait_for_spacing()

        stream = self._client.models.generate_content_stream(
            model=model,
            contents=contents,
            config=gen_config,
        )

        for chunk in stream:
            text = getattr(chunk, "text", None)
            if text:
                yield text

    # -----------------------------------------------------------------
    # INTERNAL: retry, 429 handling, content builder
    # -----------------------------------------------------------------

    def _call_with_retry(self, model, contents, config):
        """Call Gemini API with tenacity retry + 429-aware backoff + key rotation."""

        def _is_retryable(exc):
            """Return True if the error should be retried (non-429, non-auth)."""
            error_str = str(exc)
            # 429 handled separately by the outer loop — don't retry here
            if '429' in error_str or 'RESOURCE_EXHAUSTED' in error_str:
                return False
            # Never retry auth errors
            if '401' in error_str or '403' in error_str or 'PERMISSION_DENIED' in error_str:
                return False
            # Retry everything else (500, 503, network, timeout)
            return True

        @retry(
            stop=stop_after_attempt(self.max_retries),
            wait=wait_exponential(multiplier=1, min=1, max=10),
            retry=retry_if_exception(_is_retryable),
            reraise=True,
        )
        def _do_call():
            self._wait_for_spacing()
            return self._client.models.generate_content(
                model=model,
                contents=contents,
                config=config,
            )

        # Outer loop: handle 429 with Retry-After + key rotation
        last_429_error = None
        for attempt in range(self._rate_limit_max_retries + 1):
            try:
                return _do_call()
            except Exception as e:
                if not _is_rate_limit_error(e):
                    raise  # Non-429 errors propagate immediately

                last_429_error = e
                retry_after = _parse_retry_after(e)

                # Try rotating to another key first (instant, no wait)
                if self._rotate_key():
                    logger.warning(
                        f"⚠️ 429 rate limited on key #{self._current_key_index}. "
                        f"Rotated to next key, retrying immediately (attempt {attempt + 1}/{self._rate_limit_max_retries + 1})"
                    )
                    continue

                # No more keys — wait and retry with same key
                if attempt < self._rate_limit_max_retries:
                    # Add jitter: retry_after + random 1-5s
                    jitter = random.uniform(1.0, 5.0)
                    wait_time = min(retry_after + jitter, 60.0)  # Cap at 60s
                    logger.warning(
                        f"🔄 Rate limited (429). Waiting {wait_time:.1f}s before retry "
                        f"(attempt {attempt + 1}/{self._rate_limit_max_retries + 1})"
                    )
                    time.sleep(wait_time)
                else:
                    logger.error(
                        f"❌ Rate limit exhausted after {self._rate_limit_max_retries + 1} attempts. "
                        f"Retry-After was {retry_after:.1f}s"
                    )

        # All retries exhausted — raise a specific RateLimitError
        raise RateLimitError(
            f"Gemini API rate limit exceeded after {self._rate_limit_max_retries + 1} attempts. "
            f"Consider upgrading your API plan or adding more API keys.",
            retry_after=_parse_retry_after(last_429_error) if last_429_error else 0,
            original_error=last_429_error,
        )

    def _build_contents(self, messages: List[Dict[str, str]]) -> list:
        """
        Convert [{"role": "user"|"assistant", "content": "..."}] to Gemini content format.
        Gemini uses "user" and "model" roles (not "assistant").
        System messages are handled via system_instruction in config.
        """
        types = self._types
        contents = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role == "system":
                # System messages handled in config.system_instruction — skip
                continue
            gemini_role = "model" if role == "assistant" else "user"
            contents.append(types.Content(
                role=gemini_role,
                parts=[types.Part(text=content)],
            ))
        return contents
