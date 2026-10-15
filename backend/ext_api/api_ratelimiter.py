import time
from datetime import time as dt_time, timezone, timedelta, datetime
import logging
import asyncio
import json
from .api_exceptions import RateLimiterDailyQuotaExceeded, RateLimiterError
from pathlib import Path




class RateLimiter:
    """This class controls daily, monthly, and per-second limits(psl)
        meant for API rate limit management.
    Notes:
    Monthly limit is not implemented.
    JSON saving is a temporary measure, configuration backups should be stored by a database.

    Args:
        config_file_path: Path to the JSON file containing limiter settings.

    Attributes:
        config_file_path: Path to the JSON configuration file.
        config: Loaded configuration, including the limits and their usage state.
        lock: Resource lock.
        config_backup_interval: Seconds between routine config backups(saves).
        _save_task: Background task for periodic saves or None if not started
        enable_monthly_limit: Monthly rate limit enabled flag. (Not implemented)
        enable_daily_limit: Daily rate limit enabled flag.
        enable_psl: per-second limit (psl) enabled flag.
        time_zone: Time zone parsed from the daily limit's reset_time.
        last_call_time: Timestamp for calculating per-second request spacing
        psl_capacity: Total psl capacity.
        psl_strict_mode: Whether psl uses strict limiter (will not exceed the limit)
            or loose token-bucket mode (Can exceed hard limit if traffic is dense).
        psl_counter: Current request count used by loose psl.
        psl_interval: Minimum interval between requests in strict mode and the
            retry interval in loose mode, in seconds.
    """
    default_config = {
    "url": "api.example.com",
    "Usage": {},
    "limit_per_month": {"enabled": False, "max_requests": 10000, "current_quota": 0},
    "limit_per_day": {
        "enabled": False,
        "max_requests": 1000,
        "current_quota": 0,
        "current_day": "1970-01-01",
        "reset_time": "21:35:00+00:00",  # Reset time
        "soft_retry": False,  # flag for trying again after the quota is exceeded (Not yet implemented)
    },
    "limit_per_second": {"enabled": False, "max_requests": 10, "mode": "strict/loose"},
}
    def __init__(self, config_file_path: Path):
        self.lock: asyncio.Lock = asyncio.Lock()  # Resource lock for async operations
        
        self.config_file_path: Path = config_file_path
        self.config: dict = self._load_config(config_file_path)
        self.validate_config()

        self.config_backup_interval: float = 300.0  # seconds
        self._save_task: asyncio.Task | None = None

        self.enable_monthly_limit: bool = self.config["limit_per_month"]["enabled"]
        self.enable_daily_limit: bool = self.config["limit_per_day"]["enabled"]   
        self.enable_psl: bool = self.config["limit_per_second"]["enabled"]

        dt = dt_time.fromisoformat(self.config["limit_per_day"]["reset_time"])
        self.time_zone: timezone = dt.tzinfo

        self.last_call_time: float = 0.0
        self.psl_capacity: int = self.config["limit_per_second"]["max_requests"]
        self.psl_strict_mode: bool = self.config["limit_per_second"]["mode"] == "strict"
        self.psl_counter: bool = self.psl_capacity

        self.psl_interval: float = 1 / self.psl_capacity

    @classmethod
    def generate_default_config(cls, config_file_path: str):
        """Generate a default configuration file for the rate limiter.

        Args:
            config_file_path: Path where the default configuration will be saved.
        """
        with open(config_file_path, "w", encoding="utf-8") as f:
            json.dump(cls.default_config, f, indent=4)

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_value, traceback):
        if self._save_task:
            self._save_task.cancel()
            try:
                # waiting for the task to finish
                await self._save_task
            except asyncio.CancelledError:
                await self.save_config()  # Ensure config is saved on exit
        return False

    async def save_config(self):
        async with self.lock:
            with open(self.config_file_path, "w", encoding="utf-8") as f:
                json.dump(self.config, f, indent=4)
    
    def _load_config(self, config_file: str) -> dict:
        try:
            with open(config_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except FileNotFoundError:
            logging.error("Rate limiter config file not found and generated: %s", config_file)
            self.generate_default_config(self.config_file_path)
            raise

    def validate_config(self):
        """Validate configurations
        Raises: RateLimiterError Exception
        """
        if self.config["limit_per_day"]["max_requests"] <= 0:
            raise RateLimiterError("Max requests per day must be greater than 0.")
        if self.config["limit_per_second"]["max_requests"] <= 0:
            raise RateLimiterError(
                "Max requests per second must be greater than 0."
            )
        if self.config["limit_per_second"]["mode"] not in ["strict", "loose"]:
            raise RateLimiterError("Mode must be either 'strict' or 'loose'.")

    async def check_monthly_limit(self):
        raise NotImplementedError("Monthly rate limiting is not implemented yet.")

    async def check_daily_limit(self):
        
        async with self.lock:
            today = datetime.now(tz=self.time_zone).strftime("%Y-%m-%d")
            # Check if the current day has changed and reset the daily quota
            if today != self.config["limit_per_day"]["current_day"]:
                self.config["limit_per_day"]["current_quota"] = 0
                self.config["limit_per_day"]["current_day"] = today
                self.config["limit_per_day"]["soft_retry"] = False

            if (
                self.config["limit_per_day"]["current_quota"]
                >= self.config["limit_per_day"]["max_requests"]
            ):
                raise RateLimiterDailyQuotaExceeded("Daily quota exceeded for the API.")

            self.config["limit_per_day"]["current_quota"] += 1

    async def routine_config_backup(self):
        if self._save_task is None:
            self._save_task = asyncio.create_task(self._routine_config_backup_loop())

    async def _routine_config_backup_loop(self):
        try:
            while True:
                await asyncio.sleep(self.config_backup_interval)
                await self.save_config()
        except asyncio.CancelledError:
            await self.save_config()

    async def request(self):
        """Attempt to acquire the lock and check configured rate limits.
        raises:
            RateLimiterDailyQuotaExceeded: If the daily quota is exceeded.
            RateLimiterMonthlyQuotaExceeded: If the monthly quota is exceeded.(Not implemented yet)
            RateLimiterError: If the rate limiter encounters an timeout.
        """
        await self.routine_config_backup()

        if self.enable_monthly_limit:
            await self.check_monthly_limit()
        if self.enable_daily_limit:
            await self.check_daily_limit()
        if self.enable_psl:
            await self.check_psl()

    async def check_psl(self, timeout: float = 5.0):
        if self.psl_strict_mode:
            await self._check_psl_strict()
        else:
            start_time = time.time()
            while True:
                if await self._check_psl_loose():
                    return
                if time.time() - start_time > timeout:
                    raise RateLimiterError(
                        "Rate limiter timeout while waiting for psl."
                    )
                await asyncio.sleep(
                    self.psl_interval
                )  # This can be set to a smaller value for more frequent checks

    async def _check_psl_loose(self):
        async with self.lock:
            now = time.time()
            dt = now - self.last_call_time
            self.psl_counter = min(
                self.psl_capacity, self.psl_counter + dt * self.psl_capacity
            )
            if self.psl_counter < 1:
                return False
            else:
                self.psl_counter -= 1
                self.last_call_time = now
                return True

    async def _check_psl_strict(self):
        async with self.lock:
            now = time.time()
            dt = now - self.last_call_time
            wait_time = max(0, self.psl_interval - dt)
            self.last_call_time = now + wait_time

        if wait_time > 0:
            await asyncio.sleep(wait_time)

import copy
from datetime import datetime
from pathlib import Path


import backend.ext_api.api_ratelimiter as rate_limiter_module
from backend.ext_api.api_exceptions import (
    RateLimiterDailyQuotaExceeded,
    RateLimiterError,
)
from backend.ext_api.api_ratelimiter import RateLimiter


def make_config(**overrides):
    config = copy.deepcopy(RateLimiter.default_config)
    config["limit_per_second"]["mode"] = "strict"

    for section, values in overrides.items():
        config[section].update(values)

    return config


def write_config(path: Path, config: dict) -> Path:
    path.write_text(json.dumps(config), encoding="utf-8")
    return path


def make_limiter(tmp_path: Path, **overrides) -> RateLimiter:
    path = write_config(tmp_path / "rate_limiter.json", make_config(**overrides))
    return RateLimiter(path)


def test_generated_default_config_is_valid_and_can_be_loaded(tmp_path):
    config_path = tmp_path / "rate_limiter.json"

    RateLimiter.generate_default_config(config_path)

    assert json.loads(config_path.read_text(encoding="utf-8")) == RateLimiter.default_config
    limiter = RateLimiter(config_path)
    assert limiter.config == RateLimiter.default_config


def test_missing_config_is_generated_and_limiter_uses_it(tmp_path):
    config_path = tmp_path / "new_config.json"

    limiter = RateLimiter(config_path)

    assert config_path.is_file()
    assert limiter.config == RateLimiter.default_config


def test_loads_configuration_values_and_timezone(tmp_path):
    config = make_config(
        limit_per_day={"enabled": True, "reset_time": "21:35:00+05:30"},
        limit_per_second={"enabled": True, "max_requests": 4, "mode": "loose"},
    )
    limiter = RateLimiter(write_config(tmp_path / "config.json", config))

    assert limiter.enable_daily_limit is True
    assert limiter.enable_psl is True
    assert limiter.psl_capacity == 4
    assert limiter.psl_strict_mode is False
    assert limiter.time_zone.utcoffset(None).total_seconds() == 5.5 * 60 * 60


@pytest.mark.parametrize(
    ("section", "key", "value"),
    [
        ("limit_per_day", "max_requests", 0),
        ("limit_per_day", "max_requests", -1),
        ("limit_per_second", "max_requests", 0),
        ("limit_per_second", "max_requests", -1),
        ("limit_per_second", "mode", "invalid"),
    ],
)
def test_rejects_invalid_configuration(tmp_path, section, key, value):
    config = make_config()
    config[section][key] = value

    with pytest.raises(RateLimiterError):
        RateLimiter(write_config(tmp_path / "invalid.json", config))


def test_daily_limit_allows_exactly_configured_number_of_requests(tmp_path):
    limiter = make_limiter(
        tmp_path,
        limit_per_day={"enabled": True, "max_requests": 2, "current_quota": 0},
    )

    async def run():
        await limiter.check_daily_limit()
        await limiter.check_daily_limit()
        with pytest.raises(RateLimiterDailyQuotaExceeded):
            await limiter.check_daily_limit()

    asyncio.run(run())
    assert limiter.config["limit_per_day"]["current_quota"] == 2


def test_daily_limit_resets_quota_and_soft_retry_on_new_day(tmp_path):
    limiter = make_limiter(
        tmp_path,
        limit_per_day={
            "enabled": True,
            "max_requests": 2,
            "current_quota": 2,
            "current_day": "2000-01-01",
            "soft_retry": True,
        },
    )

    asyncio.run(limiter.check_daily_limit())

    daily_config = limiter.config["limit_per_day"]
    assert daily_config["current_day"] == datetime.now(
        tz=limiter.time_zone
    ).strftime("%Y-%m-%d")
    assert daily_config["current_quota"] == 1
    assert daily_config["soft_retry"] is False


def test_daily_quota_is_safe_under_concurrent_calls(tmp_path):
    limiter = make_limiter(
        tmp_path,
        limit_per_day={"enabled": True, "max_requests": 4, "current_quota": 0},
    )

    async def run():
        results = await asyncio.gather(
            *(limiter.check_daily_limit() for _ in range(10)),
            return_exceptions=True,
        )
        return results

    results = asyncio.run(run())

    assert sum(result is None for result in results) == 4
    assert sum(isinstance(result, RateLimiterDailyQuotaExceeded) for result in results) == 6
    assert limiter.config["limit_per_day"]["current_quota"] == 4


def test_save_and_reload_persist_updated_config(tmp_path):
    config_path = write_config(tmp_path / "config.json", make_config())
    limiter = RateLimiter(config_path)
    limiter.config["Usage"]["requests"] = 7

    asyncio.run(limiter.save_config())

    reloaded = RateLimiter(config_path)
    assert reloaded.config["Usage"]["requests"] == 7


def test_strict_psl_waits_for_interval_between_requests(tmp_path, monkeypatch):
    limiter = make_limiter(
        tmp_path,
        limit_per_second={"enabled": True, "max_requests": 4, "mode": "strict"},
    )
    clock = [100.0]
    sleep_durations = []

    async def fake_sleep(duration):
        sleep_durations.append(duration)
        clock[0] += duration

    monkeypatch.setattr(rate_limiter_module.time, "time", lambda: clock[0])
    monkeypatch.setattr(rate_limiter_module.asyncio, "sleep", fake_sleep)

    async def run():
        await limiter.check_psl()
        await limiter.check_psl()

    asyncio.run(run())

    assert sleep_durations == [pytest.approx(0.25)]


def test_loose_psl_consumes_and_replenishes_tokens(tmp_path, monkeypatch):
    limiter = make_limiter(
        tmp_path,
        limit_per_second={"enabled": True, "max_requests": 2, "mode": "loose"},
    )
    clock = [100.0]
    monkeypatch.setattr(rate_limiter_module.time, "time", lambda: clock[0])

    async def run():
        assert await limiter._check_psl_loose() is True
        assert await limiter._check_psl_loose() is True
        assert await limiter._check_psl_loose() is False
        clock[0] += 0.5
        assert await limiter._check_psl_loose() is True
        assert limiter.psl_counter == pytest.approx(0.0)

        clock[0] += 10
        assert await limiter._check_psl_loose() is True
        assert limiter.psl_counter == pytest.approx(1.0)

    asyncio.run(run())


def test_loose_psl_raises_after_timeout(tmp_path, monkeypatch):
    limiter = make_limiter(
        tmp_path,
        limit_per_second={"enabled": True, "max_requests": 100, "mode": "loose"},
    )
    clock = [0.0]

    async def always_empty():
        return False

    async def fake_sleep(duration):
        clock[0] += duration

    monkeypatch.setattr(limiter, "_check_psl_loose", always_empty)
    monkeypatch.setattr(rate_limiter_module.time, "time", lambda: clock[0])
    monkeypatch.setattr(rate_limiter_module.asyncio, "sleep", fake_sleep)

    with pytest.raises(RateLimiterError, match="timeout"):
        asyncio.run(limiter.check_psl(timeout=0.15))

    assert clock[0] > 0.15


def test_request_skips_disabled_limits_and_starts_single_backup_task(tmp_path):
    limiter = make_limiter(tmp_path)

    async def run():
        await limiter.request()
        first_task = limiter._save_task
        await limiter.request()
        assert limiter._save_task is first_task
        await limiter.__aexit__(None, None, None)

    asyncio.run(run())

    assert limiter.config["limit_per_day"]["current_quota"] == 0
    assert limiter._save_task.done()


def test_monthly_limit_reports_unimplemented_behavior_and_stops_backup(tmp_path):
    limiter = make_limiter(
        tmp_path,
        limit_per_month={"enabled": True},
    )

    async def run():
        with pytest.raises(NotImplementedError, match="not implemented"):
            await limiter.request()
        await limiter.__aexit__(None, None, None)

    asyncio.run(run())


def test_context_exit_saves_config_and_does_not_suppress_errors(tmp_path):
    config_path = write_config(tmp_path / "config.json", make_config())
    limiter = RateLimiter(config_path)

    async def run():
        async with limiter:
            await limiter.request()
            limiter.config["Usage"]["persisted"] = True
            raise ValueError("from context body")

    with pytest.raises(ValueError, match="from context body"):
        asyncio.run(run())

    saved = json.loads(config_path.read_text(encoding="utf-8"))
    assert saved["Usage"]["persisted"] is True

