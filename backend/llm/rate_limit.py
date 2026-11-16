"""Request limits for Gemini calls, so the app stays under the API's quota.

Counts calls in the last minute and the last 24 hours. Limits are per process:
each server worker keeps its own counts."""

import logging
import os
import threading
import time
from collections import deque
from collections.abc import Callable

logger = logging.getLogger(__name__)

MINUTE = 60.0
DAY = 24 * 60 * 60.0

# Defaults sit below Gemini's free-tier limits; override with GEMINI_RPM / GEMINI_RPD.
DEFAULT_PER_MINUTE = 10
DEFAULT_PER_DAY = 500


class GeminiRateLimiter:
    """Allows at most per_minute calls per minute and per_day calls per 24 hours.

    A limit of 0 turns that limit off. Thread-safe."""

    def __init__(
        self,
        per_minute: int = DEFAULT_PER_MINUTE,
        per_day: int = DEFAULT_PER_DAY,
        clock: Callable[[], float] = time.monotonic,
    ):
        if per_minute < 0 or per_day < 0:
            raise ValueError("Rate limits must be 0 or more")
        self.per_minute = per_minute
        self.per_day = per_day
        self._clock = clock
        self._calls: deque[float] = deque()
        self._lock = threading.Lock()

    def try_acquire(self) -> bool:
        """Record one call and return True, or return False if a limit is reached."""
        with self._lock:
            now = self._clock()
            while self._calls and now - self._calls[0] >= DAY:
                self._calls.popleft()
            last_minute = sum(1 for called in self._calls if now - called < MINUTE)
            if self.per_minute and last_minute >= self.per_minute:
                return False
            if self.per_day and len(self._calls) >= self.per_day:
                return False
            self._calls.append(now)
            return True

    @classmethod
    def from_env(cls) -> "GeminiRateLimiter":
        """Build a limiter from GEMINI_RPM and GEMINI_RPD, falling back to the defaults."""
        return cls(
            per_minute=_limit_from_env("GEMINI_RPM", DEFAULT_PER_MINUTE),
            per_day=_limit_from_env("GEMINI_RPD", DEFAULT_PER_DAY),
        )


def _limit_from_env(name: str, default: int) -> int:
    value = os.getenv(name, "").strip()
    if not value:
        return default
    try:
        limit = int(value)
    except ValueError:
        limit = -1
    if limit < 0:
        logger.warning("Ignoring %s=%r; using %d", name, value, default)
        return default
    return limit
