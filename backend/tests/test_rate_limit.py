"""Tests for the Gemini rate limiter, using a fake clock."""

import threading

import pytest

from backend.llm.rate_limit import (
    DAY,
    DEFAULT_PER_DAY,
    DEFAULT_PER_MINUTE,
    MINUTE,
    GeminiRateLimiter,
)


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += seconds


def acquire_many(limiter, count):
    return [limiter.try_acquire() for _ in range(count)]


def test_per_minute_limit_blocks_then_frees_after_a_minute():
    clock = FakeClock()
    limiter = GeminiRateLimiter(per_minute=3, per_day=0, clock=clock)
    assert acquire_many(limiter, 4) == [True, True, True, False]
    clock.advance(MINUTE - 1)
    assert limiter.try_acquire() is False
    clock.advance(1)
    assert acquire_many(limiter, 4) == [True, True, True, False]


def test_minute_window_slides():
    clock = FakeClock()
    limiter = GeminiRateLimiter(per_minute=2, per_day=0, clock=clock)
    assert limiter.try_acquire()
    clock.advance(30)
    assert limiter.try_acquire()
    clock.advance(30)  # the first call is now a minute old
    assert acquire_many(limiter, 2) == [True, False]


def test_per_day_limit_blocks_then_frees_after_24_hours():
    clock = FakeClock()
    limiter = GeminiRateLimiter(per_minute=0, per_day=3, clock=clock)
    assert acquire_many(limiter, 3) == [True, True, True]
    clock.advance(DAY - 1)
    assert limiter.try_acquire() is False
    clock.advance(1)
    assert limiter.try_acquire() is True


def test_blocked_calls_are_not_counted():
    clock = FakeClock()
    limiter = GeminiRateLimiter(per_minute=1, per_day=2, clock=clock)
    assert acquire_many(limiter, 5) == [True, False, False, False, False]
    clock.advance(MINUTE)
    assert limiter.try_acquire() is True  # the 4 refused calls didn't use the daily quota


def test_zero_turns_limits_off():
    limiter = GeminiRateLimiter(per_minute=0, per_day=0, clock=FakeClock())
    assert all(acquire_many(limiter, 1000))


def test_negative_limits_are_rejected():
    with pytest.raises(ValueError):
        GeminiRateLimiter(per_minute=-1)


def test_concurrent_calls_never_exceed_the_limit():
    limiter = GeminiRateLimiter(per_minute=25, per_day=0)
    allowed = []

    def worker():
        allowed.extend(result for result in acquire_many(limiter, 10) if result)

    threads = [threading.Thread(target=worker) for _ in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert len(allowed) == 25


def test_from_env_reads_limits(monkeypatch):
    monkeypatch.setenv("GEMINI_RPM", "4")
    monkeypatch.setenv("GEMINI_RPD", "0")
    limiter = GeminiRateLimiter.from_env()
    assert (limiter.per_minute, limiter.per_day) == (4, 0)


@pytest.mark.parametrize("value", ["", "abc", "-5", "2.5"])
def test_from_env_falls_back_to_defaults(monkeypatch, value):
    monkeypatch.setenv("GEMINI_RPM", value)
    monkeypatch.setenv("GEMINI_RPD", value)
    limiter = GeminiRateLimiter.from_env()
    assert (limiter.per_minute, limiter.per_day) == (DEFAULT_PER_MINUTE, DEFAULT_PER_DAY)
