import time
from datetime import time as dt_time, timezone, timedelta, datetime
import logging
import asyncio
import json
from .api_exceptions import RateLimiterDailyQuotaExceeded, RateLimiterError

default_config={
    "url": "https://api.example.com",
    "Usage":{},
    "limit_per_month":{
        "enabled": False,
        "max_requests": 10000,
        "current_quota": 0
    },
    "limit_per_day":{
        "enabled": False,
        "max_requests": 1000,
        "current_quota": 0,
        "current_day": "1970-01-01",
        "reset_time": "21:35:00+00:00",  # Reset at midnight UTC
        "soft_retry": False # flag for trying again after the quota is exceeded (Not yet implemented)
    },
    "limit_per_second":{
        "enabled": False,
        "max_requests": 10,
        "mode": "strict/loose"
    }
}

class RateLimiter:
    """Apply configured daily, monthly, and per-second API request limits.

    Args:
        config_file_path: Path to the JSON file containing limiter settings.

    Attributes:
        config_file_path: Path to the JSON configuration file.
        config: Loaded configuration, including the limits and their usage state.
        lock: Async lock protecting concurrent rate-limit state updates.
        config_backup_interval: Seconds between periodic configuration saves.
        _save_task: Background task for periodic saves, or ``None`` if it has
            not been started.
        monthly_limit: Whether monthly rate limiting is enabled. Enforcement
            is not implemented yet.
        daily_limit: Whether daily rate limiting is enabled.
        secondly_limit: Whether per-second rate limiting is enabled.
        time_zone: Time zone parsed from the daily limit's ``reset_time``.
        last_call_time: Timestamp used to calculate per-second request spacing
            or token replenishment.
        lps_capacity: Configured per-second request capacity.
        lps_strict_mode: Whether per-second limiting uses strict spacing rather
            than the loose token-bucket mode.
        lps_counter: Current token count used by loose per-second limiting.
        lsp_interval: Minimum interval between requests in strict mode and the
            retry interval in loose mode, in seconds.
    """

    def __init__(self, config_file_path: str):
        self.lock = asyncio.Lock() # Resource lock for async operations

        self.config_file_path = config_file_path
        self.config = self._load_config(config_file_path)
        self.validate_config()

        self.config_backup_interval = 300  # seconds
        self._save_task = None

        self.monthly_limit = self.config["limit_per_month"]["enabled"] if "limit_per_month" in config else False
        self.daily_limit = self.config["limit_per_day"]["enabled"] if "limit_per_day" in config else False
        self.secondly_limit = self.config["limit_per_second"]["enabled"] if "limit_per_second" in config else False
        dt = datetime.fromisoformat(config["limit_per_day"]["reset_time"])
        self.time_zone=dt.tzinfo
        
        
        self.last_call_time = 0.0
        self.lps_capacity = self.config["limit_per_second"]["max_requests"]
        self.lps_strict_mode = self.config["limit_per_second"]["mode"] == "strict"
        self.lps_counter = self.lps_capacity

        self.lsp_interval = 1 / self.lps_capacity

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
        with self.lock():
            if self.config["limit_per_day"]["max_requests"] <= 0:
                raise RateLimiterError("Max requests per day must be greater than 0.")
            if self.config["limit_per_second"]["max_requests"] <= 0:
                raise RateLimiterError("Max requests per second must be greater than 0.")
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

            if self.config["limit_per_day"]["current_quota"] >= self.config["limit_per_day"]["max_requests"]:
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

        if self.monthly_limit:
            await self.check_monthly_limit()
        if self.daily_limit:
            await self.check_daily_limit()
        if self.secondly_limit:
            await self.check_lps()


    
    async def check_lps(self, timeout:float=5.0):
        if self.lps_strict_mode:
            await self._check_lps_strict()
        else:
            start_time = time.time()
            while True:
                if await self._check_lps_loose():
                    return
                if time.time() - start_time > timeout:
                    raise RateLimiterError("Rate limiter timeout while waiting for LPS.")
                await asyncio.sleep(self.lsp_interval)  # This can be set to a smaller value for more frequent checks
    
    async def _check_lps_loose(self):
        async with self.lock:
            now = time.time()
            dt = now - self.last_call_time
            self.lps_counter = min(
                self.lps_capacity, 
                self.lps_counter + dt * self.lps_capacity
            )
            if self.lps_counter < 1:
                return False
            else:
                self.lps_counter -= 1
                self.last_call_time = now
                return True

    async def _check_lps_strict(self):
        async with self.lock:
            now = time.time()
            dt = now - self.last_call_time
            wait_time = max(0, self.lsp_interval - dt)
            self.last_call_time = now + wait_time

        if wait_time > 0:
            await asyncio.sleep(wait_time)