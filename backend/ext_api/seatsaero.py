from .api_template import APIRouterTemplate
import dotenv
import os
import time
import asyncio
import dotenv
from utils import bridge_run
import logging
from . import APIRouterError, APIStatusError, APITimeout

logger = logging.getLogger(__name__)

dotenv.load_dotenv()


class SeatsAeroAPI(APIRouterTemplate):
    def __init__(
        self,
        timeout: float = 10.0,
    ):
        base_url = os.getenv("SEATSAERO_BASE_URL")
        if base_url is None:
            raise APIRouterError("Invalid Base URL")
        super().__init__(api_name="seatsaero", base_url=base_url, oauth=False)
        search_cache = {}
        search_cache_example = {
            "cursor_idxxx": {"ttl": "sometime", "results": ["someresult1", "2"]}
        }
        self.cache_lock = asyncio.Lock()

    def _auth(self):
        if "Partner-Authorization" not in self.default_headers:
            self.default_headers["Partner-Authorization"] = os.getenv("SEATSAERO_TOKEN")

    async def async_cached_search(self, params: dict) -> dict:
        """
        Submit a request to the Cached Search endpoint.
        params: Dictionary of query parameters for the search.
        return: The response from the API.
        """
        async with self.cache_lock:
            try:
                result = await self.get("/search", params=params)
                await self.record_usage(1)
                return result
            except APIStatusError as e:
                logging.error("Code error: cached_search failed with %s", e.status_code)
                await self.record_usage(1)
                raise
            except APITimeout:
                logging.error("Timeout error: cached_search api timeout")
                raise
            except APIRouterError:
                logging.error("API Router Error: cached_search endpoint")
                raise
            except Exception:
                logger.exception("Unknown Error: cached_search endpoint")
                raise

    async def async_get_trips(self, trip_id, params={}) -> dict:
        """
        Submit a request to the Get Trips endpoint.
         trip_id: The ID of the trip to retrieve (path variable).
        params: Dictionary of query parameters for the search.
        :return: The response from the API.
        """
        async with self.cache_lock:
            try:
                result = await self.get(f"/trips/{trip_id}", params=params)
                await self.record_usage(1)
                return result
            except APIStatusError as e:
                logger.error("Code error: get_trips failed with %s", e.status_code)
                await self.record_usage(1)
                raise
            except APITimeout:
                logger.error("Timeout error: get_trips api timeout")
                raise
            except APIRouterError:
                logger.error("API Router Error: get_trips endpoint")
                raise
            except Exception:
                logger.exception("Unknown Error: get_trips endpoint")
                raise

    async def async_get_routes(self, params: dict) -> dict:
        """
        Submit a request to the Get Routes endpoint.
        params: Dictionary of query parameters for the search.
        return: The response from the API."""
        async with self.cache_lock:
            try:
                result = await self.get("/routes", params=params)
                await self.record_usage(1)
                return result
            except APIStatusError as e:
                logger.error("Code error: get_routes failed with %s", e.status_code)
                await self.record_usage(1)
                raise
            except APITimeout:
                logger.error("Timeout error: get_routes api timeout")
                raise
            except APIRouterError:
                logger.error("API Router Error: get_routes endpoint")
                raise
            except Exception:
                logger.exception("Unknown Error: get_routes endpoint")
                raise

    async def async_get_destinations(self, params: dict) -> dict:
        """
        Submit a request to the Get Destinations endpoint.
        params: Dictionary of query parameters for the search.
        return: The response from the API.
        """
        async with self.cache_lock:
            try:
                result = await self.get("/destinations", params=params)
                await self.record_usage(1)
                return result
            except APIStatusError as e:
                logger.error(
                    "Code error: get_destinations failed with %s", e.status_code
                )
                await self.record_usage(1)
                raise
            except APITimeout:
                logger.error("Timeout error: get_destinations api timeout")
                raise
            except APIRouterError:
                logger.error("API Router Error: get_destinations endpoint")
                raise
            except Exception:
                logger.exception("Unknown Error: get_destinations endpoint")
                raise

    async def async_get_availability(self, params: dict) -> dict:
        """
        Submit a request to the Get Availability endpoint.
        params: Dictionary of query parameters for the search.
        return: The response from the API.
        """
        async with self.cache_lock:
            try:
                result = await self.get("/availability", params=params)
                await self.record_usage(1)
                return result
            except APIStatusError as e:
                logger.error(
                    "Code error: get_availability failed with %s", e.status_code
                )
                await self.record_usage(1)
                raise
            except APITimeout:
                logger.error("Timeout error: get_availability api timeout")
                raise
            except APIRouterError:
                logger.error("API Router Error: get_availability endpoint")
                raise
            except Exception:
                logger.exception("Unknown Error: get_availability endpoint")
                raise

    async def async_get_alerts(self) -> dict:
        """
        Submit a request to the Get Alerts endpoint.
        return: The response from the API.
        """
        async with self.cache_lock:
            try:
                result = await self.get("/alerts")
                await self.record_usage(1)
                return result
            except APIStatusError as e:
                logger.error("Code error: get_alerts failed with %s", e.status_code)
                await self.record_usage(1)
                raise
            except APITimeout:
                logger.error("Timeout error: get_alerts api timeout")
                raise
            except APIRouterError:
                logger.error("API Router Error: get_alerts endpoint")
                raise
            except Exception:
                logger.exception("Unknown Error: get_alerts endpoint")
                raise

    async def async_live_search(self, payload: dict) -> dict:
        """
        Submit a request to the Live Search endpoint.
        payload: Dictionary of the request body for the search.
        return: The response from the API."""
        async with self.cache_lock:
            try:
                result = await self.post("/live", payload=payload)
                await self.record_usage(1)
                return result
            except APIStatusError as e:
                logger.error("Code error: live_search failed with %s", e.status_code)
                await self.record_usage(1)
                raise
            except APITimeout:
                logger.error("Timeout error: live_search api timeout")
                raise
            except APIRouterError:
                logger.error("API Router Error: live_search endpoint")
                raise
            except Exception:
                logger.exception("Unknown Error: live_search endpoint")
                raise

    async def async_refresh_cached_data(self, payload: dict) -> dict:
        """Submit a request to the Refresh Cached Data endpoint.
        payload: Dictionary of the request body for the refresh.
        return: The response from the API.
        """
        async with self.cache_lock:
            try:
                result = await self.post("/refresh", payload=payload)
                await self.record_usage(1)
                return result
            except APIStatusError as e:
                logger.error(
                    "Code error: refresh_cached_data failed with %s", e.status_code
                )
                await self.record_usage(1)
                raise
            except APITimeout:
                logger.error("Timeout error: refresh_cached_data api timeout")
                raise
            except APIRouterError:
                logger.error("API Router Error: refresh_cached_data endpoint")
                raise
            except Exception:
                logger.exception("Unknown Error: refresh_cached_data endpoint")
                raise

    def cached_search(self, params: dict):
        """Synchronous wrapper for async_cached_search, submit a request to the Cached Search endpoint.
        params: Dictionary of query parameters for the search.
        return: The response from the API.
        """
        return bridge_run(self.async_cached_search(params))

    def get_trips(self, trip_id, params={}):
        """Synchronous wrapper for async_get_trips, submit a request to the Get Trips endpoint.
        trip_id: The ID of the trip to retrieve (path variable).
        params: Dictionary of query parameters for the search.
        return: The response from the API.
        """
        return bridge_run(self.async_get_trips(trip_id, params))

    def get_routes(self, params: dict):
        """Synchronous wrapper for async_get_routes, submit a request to the Get Routes endpoint.
        params: Dictionary of query parameters for the search.
        return: The response from the API.
        """
        return bridge_run(self.async_get_routes(params))

    def get_destinations(self, params: dict):
        """Synchronous wrapper for async_get_destinations, submit a request to the Get Destinations endpoint.
        params: Dictionary of query parameters for the search.
        return: The response from the API.
        """
        return bridge_run(self.async_get_destinations(params))

    def get_availability(self, params: dict):
        """Synchronous wrapper for async_get_availability, submit a request to the Get Availability endpoint.
        params: Dictionary of query parameters for the search.
        return: The response from the API.
        """
        return bridge_run(self.async_get_availability(params))

    def get_alerts(self):
        """Synchronous wrapper for async_get_alerts, submit a request to the Get Alerts endpoint.
        return: The response from the API.
        """
        return bridge_run(self.async_get_alerts())

    def live_search(self, payload: dict):
        """Synchronous wrapper for async_live_search, submit a request to the Live Search endpoint.
        payload: Dictionary of the request body for the search.
        return: The response from the API.
        """
        return bridge_run(self.async_live_search(payload))

    def refresh_cached_data(self, payload: dict):
        """Synchronous wrapper for async_refresh_cached_data, submit a request to the Refresh Cached Data endpoint.
        payload: Dictionary of the request body for the refresh.
        return: The response from the API.
        """
        return bridge_run(self.async_refresh_cached_data(payload))
