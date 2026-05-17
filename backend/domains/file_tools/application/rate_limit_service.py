"""Lightweight V1 rate limiting for synchronous file generation."""

from __future__ import annotations

import time
from collections import defaultdict, deque

from ..domain.entities import FileToolOwner
from ..domain.errors import RateLimitError
from ..domain.policies import TEXT_TO_PDF_LIMITS


class InMemoryRateLimitService:
    def __init__(self):
        self._windows: dict[str, deque[float]] = defaultdict(deque)

    def assert_generate_allowed(self, owner: FileToolOwner, ip_address: str | None = None) -> None:
        limit = (
            TEXT_TO_PDF_LIMITS.authenticated_generate_per_minute
            if owner.is_authenticated
            else TEXT_TO_PDF_LIMITS.guest_generate_per_minute
        )
        key = owner.token_subject if owner.is_authenticated else f"{owner.token_subject}:{ip_address or 'unknown'}"
        now = time.time()
        window = self._windows[key]
        while window and window[0] <= now - 60:
            window.popleft()
        if len(window) >= limit:
            raise RateLimitError()
        window.append(now)
