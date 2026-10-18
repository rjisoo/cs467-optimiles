import time
from datetime import time as dt_time, timezone, timedelta, datetime
import logging
import asyncio
import json
from .api_exceptions import RateLimiterDailyQuotaExceeded, RateLimiterError
from pathlib import Path




class RateLimiter:
    """Enforce configured API request limits and persist limiter state.

    Call request method before submitting an API request which does daily and per-second limit checks.
    Daily quota exhaustion will raises RateLimiterDailyQuotaExceeded Exception when exceeded, and waiting too long for a loose per-second token raises RateLimiterError.
    Monthly limit management is not implemented because different api services might have different scheduling.

    Configuration AKA self.config is loaded from a JSON file. Use the class method generate_default_config to create a configuration file
    Currently config state persistance uses json format as a temporary storage measure; a database may be more appropriate.

    Args:
        config_file_path: Path to the JSON file containing limiter settings.

    Attributes:
        config_file_path: JSON file path used to load and save configuration.
        config: Loaded configuration and current quota state.
        lock: Async lock protecting shared resources.
        config_backup_interval: In seconds, interval between periodic saves.
        _save_task: Periodic save task object.
        enable_monthly_limit: Whether the monthly limit is enabled. (Not implemnted)
        enable_daily_limit: Whether the daily quota limit is enabled.
        enable_psl: Whether per-second limiting is enabled.
        time_zone: Time zone from the daily limit's reset_time value.
        last_call_time: Timestamp used by the per-second limiter.
        psl_capacity: Configured per-second request capacity.
        psl_strict_mode: Whether per-second limiting uses strict interval. (See _wait_psl_strict)
        psl_counter: Available token count for loose per-second limiting.
        psl_interval: Per-second limiter interval, in seconds.
    """

    # Class variables
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
        """Initialize the rate limiter from a JSON configuration file.

        Args:
            config_file_path: Path to the JSON configuration file.

        Raises:
            FileNotFoundError: If the configuration file is missing. A default
                configuration is generated before the error is re-raised.
            RateLimiterError: If a configured request limit or per-second mode
                is invalid.
        """
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
    def generate_default_config(cls, config_file_path: str) -> None:
        """Generate a default configuration file for the rate limiter.

        Args:
            config_file_path: Path where the default configuration will be saved.
        Raises:
            FileNotFoundError: When the directory is invalid
        """
        with open(config_file_path, "w", encoding="utf-8") as f:
            json.dump(cls.default_config, f, indent=4)

    async def __aenter__(self):
        """Return this rate limiter for use in an asynchronous context manager."""
        return self

    async def __aexit__(self, exc_type, exc_value, traceback):
        """Stop periodic backups and save the configuration when exiting.

        Args:
            exc_type: Exception type raised inside the context, if any.
            exc_value: Exception raised inside the context, if any.
            traceback: Traceback for the exception, if any.

        Returns:
            False, so any exception raised inside the context is not suppressed.
        """
        if self._save_task:
            self._save_task.cancel()
            try:
                # waiting for the task to finish
                await self._save_task
            except asyncio.CancelledError:
                await self.save_config()  # Ensure config is saved on exit
        return False

    async def save_config(self) -> None:
        """Saves the current config to a json file
        Raises:
            FileNotFoundError: If the directory or name is invalid
        """
        async with self.lock:
            with open(self.config_file_path, "w", encoding="utf-8") as f:
                json.dump(self.config, f, indent=4)
    
    def _load_config(self, config_file: Path) -> dict:
        """Load config from config_file path.
        args:
            config_file: File path to load from
        """
        try:
            with open(config_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except FileNotFoundError:
            logging.error("Rate limiter config file not found and generated: %s", config_file)
            self.generate_default_config(self.config_file_path)
            raise

    def validate_config(self) -> None:
        """Validate configurations
        Raises: 
            RateLimiterError Exception: If the config structure or value is invalid
        """
        if self.config["limit_per_day"]["max_requests"] <= 0:
            raise RateLimiterError("Max requests per day must be greater than 0.")
        if self.config["limit_per_second"]["max_requests"] <= 0:
            raise RateLimiterError(
                "Max requests per second must be greater than 0."
            )
        if self.config["limit_per_second"]["mode"] not in ["strict", "loose"]:
            raise RateLimiterError("Mode must be either 'strict' or 'loose'.")

    async def check_monthly_limit(self) -> None:
        """limits monthly rate (Not implemnted)"""
        raise NotImplementedError("Monthly rate limiting is not implemented yet.")

    async def check_daily_limit(self) -> None:
        """Check and use one request from the configured daily quota.

        The quota is reset to zero when the current date in the configured
        time zone differs from ``current_day``. The date and quota are updated
        while holding the async lock so concurrent calls cannot exceed the
        configured maximum.

        Raises:
            RateLimiterDailyQuotaExceeded: If the daily quota has already
                reached max_requests for the current day.
        """
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

    async def routine_config_backup(self) -> None:
        """Create an async task to save config file periodically
        A wrapper method to initiate an asynchronous tasks that runs _routine_config_backup_loop method
        """
        if self._save_task is None:
            self._save_task = asyncio.create_task(self._routine_config_backup_loop())

    async def _routine_config_backup_loop(self) -> None:
        """Save the config file periodically
        a infinite loop to save the config file at a defined interval as long as the rate limiter is alive
        """
        try:
            while True:
                await asyncio.sleep(self.config_backup_interval)
                await self.save_config()
        except asyncio.CancelledError:
            await self.save_config()

    async def request(self) -> None:
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
            await self.wait_psl()

    async def wait_psl(self, timeout: float = 5.0) -> None:
        """Wait until a per-second request is available.

        Strict mode spaces requests evenly by psl_interval. Loose mode consumes
        from a replenishing token bucket and retries until a token is available
        or times out while waiting.

        Args:
            timeout: Wait timeout in seconds, ignored in strict mode

        Raises:
            RateLimiterError: If loose mode does not obtain a token before the
                timeout expires. 
        """
        if self.psl_strict_mode:
            await self._wait_psl_strict()
        else:
            start_time = time.time()
            while True:
                if await self._check_psl_loose():
                    return
                if time.time() - start_time > timeout:
                    raise RateLimiterError(
                        "Rate limiter timeout while waiting for psl."
                    )
                # This can be set to a smaller value for more frequent checks
                await asyncio.sleep(self.psl_interval)  

    async def _check_psl_loose(self) -> bool:
        """Check if the token bucket has available token
        The token bucket replenishes tokens every 1/rate_per_second second
        The fucntion issues all tokens available when requested. 
        Short request bursts can theoritically exceed the rate limit temporarily.
        During heavy traffic, the rate of request should average at the correct per-second limit if measured on a longer time scale

        Return: True if token is available and consumes a token
                False if no token is available
        """
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

    async def _wait_psl_strict(self) -> None:
        """Wait for the next available request
        This strictly space requests to even intervals so that per second limit is strictly enforced.
        """
        async with self.lock:
            now = time.time()
            dt = now - self.last_call_time
            wait_time = max(0, self.psl_interval - dt)
            self.last_call_time = now + wait_time

        if wait_time > 0:
            await asyncio.sleep(wait_time)
