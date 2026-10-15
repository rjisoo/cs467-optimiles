import time
from datetime import time as dt_time, timezone, timedelta, datetime
import logging
import asyncio
import json
from .api_exceptions import RateLimiterDailyQuotaExceeded, RateLimiterError
from pathlib import Path

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

    def __init__(self, config_file_path: str):
        self.lock: asyncio.Lock = asyncio.Lock()  # Resource lock for async operations

        self.config_file_path: Path = Path(config_file_path + ".json")
        self.config: dict = self._load_config(config_file_path)
        self.validate_config()

        self.config_backup_interval: float = 300.0  # seconds
        self._save_task: asyncio.Task | None = None

        self.enable_monthly_limit: bool = (
            self.config["limit_per_month"]["enabled"]
            if "limit_per_month" in self.config
            else False
        )
        self.enable_daily_limit: bool = (
            self.config["limit_per_day"]["enabled"]
            if "limit_per_day" in self.config
            else False
        )
        self.enable_psl: bool = (
            self.config["limit_per_second"]["enabled"]
            if "limit_per_second" in self.config
            else False
        )
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
            json.dump(default_config, f, indent=4)

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_value, traceback):
        if self._save_task:
            self._save_task.cancel()
            try:
                # waiting for the task to finish
                await self._save_task
            except asyncio.CancelledError:
                self.save_config()  # Ensure config is saved on exit
        return False

    def save_config(self):
        with self.lock():
            with open(self.config_file_path, "w", encoding="utf-8") as f:
                json.dump(self.config, f, indent=4)

    def _load_config(self, config_file: str) -> dict:
        with self.lock():
            with open(config_file, "r", encoding="utf-8") as f:
                return json.load(f)

    def validate_config(self):
        """Validate configurations
        Raises: RateLimiterError Exception
        """
        with self.lock():
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
                self.save_config()
        except asyncio.CancelledError:
            self.save_config()

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
