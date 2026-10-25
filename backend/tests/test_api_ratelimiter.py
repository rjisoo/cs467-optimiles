import asyncio
import copy
import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

import backend.ext_api.api_ratelimiter as rate_limiter_module
from backend.ext_api.api_exceptions import (
    RateLimiterDailyQuotaExceeded,
    RateLimiterError,
)
from backend.ext_api.api_ratelimiter import RateLimiter

# The following tests was generated with the help of Claude Code, before reviewing and modifications.
# This transcript backend/citations/GenAI.md entry 02 documents the interaction leading to the code


def make_config(**overrides):
    config = copy.deepcopy(RateLimiter.default_config)
    config["limit_per_second"]["mode"] = "strict"

    for key, values in overrides.items():
        config[key].update(values)

    return config


def write_config(path: Path, config: dict) -> Path:
    path.write_text(json.dumps(config), encoding="utf-8")
    return path


def make_limiter(tmp_path: Path, **overrides) -> RateLimiter:
    path = write_config(tmp_path / "rate_limiter.json", make_config(**overrides))
    return RateLimiter(path)


def run(coro):
    return asyncio.run(coro)


def test_generate_default_config_writes_default_config(tmp_path: Path):
    """Tests the default config generator"""
    path = tmp_path / "rate_limiter.json"

    RateLimiter.generate_default_config(path)

    assert json.loads(path.read_text(encoding="utf-8")) == RateLimiter.default_config


def test_missing_config_generates_default_then_reraises(tmp_path: Path):
    """"""
    path = tmp_path / "missing.json"

    with pytest.raises(FileNotFoundError):
        RateLimiter(path)

    assert json.loads(path.read_text(encoding="utf-8")) == RateLimiter.default_config


@pytest.mark.parametrize(
    ("section", "values"),
    [
        ("limit_per_day", {"max_requests": 0}),
        ("limit_per_second", {"max_requests": 0}),
        ("limit_per_second", {"mode": "burst"}),
    ],
)
def test_invalid_config_values_raise_rate_limiter_error(
    tmp_path: Path, section: str, values: dict
):
    with pytest.raises(RateLimiterError):
        make_limiter(tmp_path, **{section: values})


def test_invalid_json_is_not_silently_accepted(tmp_path: Path):
    path = tmp_path / "invalid.json"
    path.write_text("{", encoding="utf-8")

    with pytest.raises(json.JSONDecodeError):
        RateLimiter(path)


def test_save_config_persists_current_configuration(tmp_path: Path):
    limiter = make_limiter(tmp_path)
    limiter.config["name"] = "changed.example.com"

    run(limiter.save_config())

    assert json.loads(limiter.config_file_path.read_text(encoding="utf-8")) == (
        limiter.config
    )


def test_routine_config_backup_starts_only_one_task(tmp_path: Path, monkeypatch):
    limiter = make_limiter(tmp_path)
    created_coroutines = []
    task = object()

    def create_task(coro):
        created_coroutines.append(coro)
        coro.close()
        return task

    monkeypatch.setattr(rate_limiter_module.asyncio, "create_task", create_task)

    async def exercise():
        await limiter.routine_config_backup()
        await limiter.routine_config_backup()

    run(exercise())

    assert limiter._save_task is task
    assert len(created_coroutines) == 1


def test_backup_loop_saves_when_cancelled(tmp_path: Path, monkeypatch):
    limiter = make_limiter(tmp_path)
    started_sleep = asyncio.Event()
    saves = []

    async def block_sleep(_delay):
        started_sleep.set()
        await asyncio.Future()

    async def save_config():
        saves.append(True)

    monkeypatch.setattr(rate_limiter_module.asyncio, "sleep", block_sleep)
    monkeypatch.setattr(limiter, "save_config", save_config)

    async def exercise():
        task = asyncio.create_task(limiter._routine_config_backup_loop())
        await started_sleep.wait()
        task.cancel()
        await task

    run(exercise())

    assert saves == [True]


def test_record_usage_tracks_tokens_by_day(tmp_path: Path, monkeypatch):
    limiter = make_limiter(tmp_path)
    now = [datetime(2025, 4, 3, tzinfo=timezone.utc)]

    class FixedDateTime:
        @classmethod
        def now(cls, tz=None):
            return now[0].astimezone(tz)

    monkeypatch.setattr(rate_limiter_module, "datetime", FixedDateTime)

    async def exercise():
        await limiter.record_usage(3)
        await limiter.record_usage()
        now[0] = datetime(2025, 4, 4, tzinfo=timezone.utc)
        await limiter.record_usage(2)

    run(exercise())

    assert limiter.config["usage"] == {
        "2025-04-03": 4,
        "2025-04-04": 2,
    }


def test_daily_quota_increments_until_max_then_raises(tmp_path: Path, monkeypatch):
    limiter = make_limiter(
        tmp_path,
        limit_per_day={"max_requests": 2, "current_quota": 0},
    )

    class FixedDateTime:
        @classmethod
        def now(cls, tz=None):
            return datetime(2025, 4, 3, tzinfo=timezone.utc).astimezone(tz)

    monkeypatch.setattr(rate_limiter_module, "datetime", FixedDateTime)

    async def exercise():
        await limiter.check_daily_limit()
        await limiter.check_daily_limit()
        with pytest.raises(RateLimiterDailyQuotaExceeded):
            await limiter.check_daily_limit()

    run(exercise())

    assert limiter.config["limit_per_day"]["current_quota"] == 2
    assert limiter.config["limit_per_day"]["current_day"] == "2025-04-03"


def test_daily_quota_resets_for_new_day_in_configured_timezone(
    tmp_path: Path, monkeypatch
):
    limiter = make_limiter(
        tmp_path,
        limit_per_day={
            "current_day": "2025-04-02",
            "current_quota": 7,
            "reset_time": "00:00:00+14:00",
            "soft_retry": True,
        },
    )
    requested_timezones = []

    class FixedDateTime:
        @classmethod
        def now(cls, tz=None):
            requested_timezones.append(tz)
            return datetime(2025, 4, 2, 12, tzinfo=timezone.utc).astimezone(tz)

    monkeypatch.setattr(rate_limiter_module, "datetime", FixedDateTime)

    run(limiter.check_daily_limit())

    assert requested_timezones == [limiter.time_zone]
    assert limiter.config["limit_per_day"]["current_day"] == "2025-04-03"
    assert limiter.config["limit_per_day"]["current_quota"] == 1
    assert limiter.config["limit_per_day"]["soft_retry"] is False


def test_concurrent_daily_requests_cannot_exceed_quota(tmp_path: Path, monkeypatch):
    limiter = make_limiter(
        tmp_path,
        limit_per_day={"max_requests": 3, "current_day": "2025-04-03"},
    )

    class FixedDateTime:
        @classmethod
        def now(cls, tz=None):
            return datetime(2025, 4, 3, tzinfo=timezone.utc).astimezone(tz)

    monkeypatch.setattr(rate_limiter_module, "datetime", FixedDateTime)

    async def exercise():
        results = await asyncio.gather(
            *(limiter.check_daily_limit() for _ in range(10)),
            return_exceptions=True,
        )
        return results

    results = run(exercise())

    assert sum(result is None for result in results) == 3
    assert (
        sum(isinstance(result, RateLimiterDailyQuotaExceeded) for result in results)
        == 7
    )
    assert limiter.config["limit_per_day"]["current_quota"] == 3


def test_strict_per_second_waits_are_evenly_spaced(tmp_path: Path, monkeypatch):
    limiter = make_limiter(
        tmp_path,
        limit_per_second={"max_requests": 2, "mode": "strict"},
    )
    clock = [100.0]
    sleep_delays = []

    def time_now():
        return clock[0]

    async def advance_time(delay):
        sleep_delays.append(delay)
        clock[0] += delay

    monkeypatch.setattr(rate_limiter_module.time, "time", time_now)
    monkeypatch.setattr(rate_limiter_module.asyncio, "sleep", advance_time)

    async def exercise():
        await limiter.wait_psl()
        await limiter.wait_psl()
        await limiter.wait_psl()

    run(exercise())

    assert sleep_delays == [pytest.approx(0.5), pytest.approx(0.5)]
    assert limiter.last_call_time == pytest.approx(101.0)


def test_loose_token_bucket_consumes_and_replenishes_tokens(
    tmp_path: Path, monkeypatch
):
    limiter = make_limiter(
        tmp_path,
        limit_per_second={"max_requests": 2, "mode": "loose"},
    )
    clock = [20.0]
    monkeypatch.setattr(rate_limiter_module.time, "time", lambda: clock[0])

    async def exercise():
        assert await limiter._check_psl_loose() is True
        assert await limiter._check_psl_loose() is True
        assert await limiter._check_psl_loose() is False
        clock[0] += 0.25
        assert await limiter._check_psl_loose() is False
        clock[0] += 0.25
        assert await limiter._check_psl_loose() is True

    run(exercise())

    assert limiter.psl_counter == 0


def test_loose_token_bucket_is_capped_at_capacity(tmp_path: Path, monkeypatch):
    limiter = make_limiter(
        tmp_path,
        limit_per_second={"max_requests": 2, "mode": "loose"},
    )
    clock = [20.0]
    monkeypatch.setattr(rate_limiter_module.time, "time", lambda: clock[0])

    async def exercise():
        assert await limiter._check_psl_loose() is True
        clock[0] += 10
        assert await limiter._check_psl_loose() is True

    run(exercise())

    assert limiter.psl_counter == 1


def test_concurrent_loose_requests_cannot_consume_same_token(
    tmp_path: Path, monkeypatch
):
    limiter = make_limiter(
        tmp_path,
        limit_per_second={"max_requests": 1, "mode": "loose"},
    )
    monkeypatch.setattr(rate_limiter_module.time, "time", lambda: 100.0)

    async def exercise():
        return await asyncio.gather(*(limiter._check_psl_loose() for _ in range(10)))

    results = run(exercise())

    assert sum(results) == 1


def test_loose_wait_returns_when_a_token_becomes_available(tmp_path: Path, monkeypatch):
    limiter = make_limiter(
        tmp_path,
        limit_per_second={"max_requests": 2, "mode": "loose"},
    )
    clock = [20.0]
    sleep_delays = []

    def time_now():
        return clock[0]

    async def advance_time(delay):
        sleep_delays.append(delay)
        clock[0] += delay

    monkeypatch.setattr(rate_limiter_module.time, "time", time_now)
    monkeypatch.setattr(rate_limiter_module.asyncio, "sleep", advance_time)

    async def exercise():
        assert await limiter._check_psl_loose() is True
        assert await limiter._check_psl_loose() is True
        await limiter.wait_psl()

    run(exercise())

    assert sleep_delays == [pytest.approx(0.5)]


def test_loose_wait_times_out_if_no_token_is_obtained(tmp_path: Path, monkeypatch):
    limiter = make_limiter(
        tmp_path,
        limit_per_second={"max_requests": 2, "mode": "loose"},
    )
    clock = [0.0]
    sleep_delays = []

    def time_now():
        return clock[0]

    async def advance_time(delay):
        sleep_delays.append(delay)
        clock[0] += delay

    async def no_token():
        return False

    monkeypatch.setattr(rate_limiter_module.time, "time", time_now)
    monkeypatch.setattr(rate_limiter_module.asyncio, "sleep", advance_time)
    monkeypatch.setattr(limiter, "_check_psl_loose", no_token)

    with pytest.raises(RateLimiterError, match="timeout"):
        run(limiter.wait_psl(timeout=1.0))

    assert len(sleep_delays) == 3


def test_request_checks_only_enabled_limits(tmp_path: Path, monkeypatch):
    limiter = make_limiter(tmp_path)
    calls = []

    async def record(name):
        calls.append(name)

    monkeypatch.setattr(limiter, "routine_config_backup", lambda: record("backup"))
    monkeypatch.setattr(limiter, "check_daily_limit", lambda: record("daily"))
    monkeypatch.setattr(limiter, "wait_psl", lambda: record("per_second"))

    run(limiter.request())

    assert calls == ["backup"]


def test_request_checks_enabled_limits_in_order(tmp_path: Path, monkeypatch):
    limiter = make_limiter(
        tmp_path,
        limit_per_day={"enabled": True},
        limit_per_second={"enabled": True},
    )
    calls = []

    async def record(name):
        calls.append(name)

    monkeypatch.setattr(limiter, "routine_config_backup", lambda: record("backup"))
    monkeypatch.setattr(limiter, "check_daily_limit", lambda: record("daily"))
    monkeypatch.setattr(limiter, "wait_psl", lambda: record("per_second"))

    run(limiter.request())

    assert calls == ["backup", "daily", "per_second"]


def test_request_does_not_continue_after_daily_quota_failure(
    tmp_path: Path, monkeypatch
):
    limiter = make_limiter(
        tmp_path,
        limit_per_day={"enabled": True},
        limit_per_second={"enabled": True},
    )
    calls = []

    async def start_backup():
        calls.append("backup")

    async def reject_daily_request():
        calls.append("daily")
        raise RateLimiterDailyQuotaExceeded

    async def wait_psl():
        calls.append("per_second")

    monkeypatch.setattr(limiter, "routine_config_backup", start_backup)
    monkeypatch.setattr(limiter, "check_daily_limit", reject_daily_request)
    monkeypatch.setattr(limiter, "wait_psl", wait_psl)

    with pytest.raises(RateLimiterDailyQuotaExceeded):
        run(limiter.request())

    assert calls == ["backup", "daily"]


def test_request_raises_not_implemented_for_enabled_monthly_limit(
    tmp_path: Path, monkeypatch
):
    limiter = make_limiter(tmp_path, limit_per_month={"enabled": True})
    monkeypatch.setattr(limiter, "routine_config_backup", lambda: asyncio.sleep(0))

    with pytest.raises(NotImplementedError, match="not implemented"):
        run(limiter.request())
