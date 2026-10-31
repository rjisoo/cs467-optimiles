from .api_template import APIRouterTemplate
import dotenv
import os
import logging
from . import APIRouterError, APIStatusError, APITimeout
from .seatsaero_models import RawCachedSearchResponse
logger = logging.getLogger(__name__)

dotenv.load_dotenv()


class SeatsAeroAPI(APIRouterTemplate):
    """Seats.Aero API integration
    Available endpoints:
    cached_search (async_cached_search)
    get_trips (async_get_trips),
    get_routes (async_get_routes),
    get_destinations (async_get_destinations),
    get_availability (async_get_availability),
    get_alerts (async_get_alerts),
    live_search (async_live_search),
    refresh_cached_data (async_refresh_cached_data)
    """

    def __init__(
        self,
        timeout: float = 10.0,
    ):
        base_url = os.getenv("SEATSAERO_BASE_URL")
        if base_url is None:
            raise APIRouterError("Invalid Base URL")
        super().__init__(api_name="seatsaero", base_url=base_url, oauth=False)

    def _auth(self):
        if "Partner-Authorization" not in self.default_headers:
            self.default_headers["Partner-Authorization"] = os.getenv("SEATSAERO_TOKEN")

    async def _async_api_request(self, request) -> dict:
        """Submit an async API request with shared error handling.

        Records usage after success or an HTTP status error, logs failures, and
        re-raises request exceptions.

        Args:
            request: Callable that returns the request awaitable.

        Returns:
            The decoded API response.

        Raises:
            APIStatusError: If the API returns a non-success HTTP status.
            APITimeout: If the request times out.
            APIRouterError: If the request fails at the router or network layer.
            Exception: Re-raises any other error raised by the request.
        """
        try:
            result = await request()
            await self.async_record_usage(1)
            return result
        except APIStatusError as e:
            logger.error("API request failed with status %s", e.status_code)
            await self.async_record_usage(1)
            raise
        except APITimeout:
            logger.error("API request timed out")
            raise
        except APIRouterError:
            logger.error("API router error")
            raise
        except Exception:
            logger.exception("Unknown API request error")
            raise

    async def async_cached_search(self, params: dict) -> dict:
        """
        Submit a request to the Cached Search endpoint.
        params: Dictionary of query parameters for the search.
        return: The response from the API.
        """
        return await self._async_api_request(
            lambda: self.async_get("/search", params=params)
        )

    async def async_get_trips(self, trip_id, params={}) -> dict:
        """
        Submit a request to the Get Trips endpoint.
         trip_id: The ID of the trip to retrieve (path variable).
        params: Dictionary of query parameters for the search.
        :return: The response from the API.
        """
        return await self._async_api_request(
            lambda: self.async_get(f"/trips/{trip_id}", params=params)
        )

    async def async_get_routes(self, params: dict) -> dict:
        """
        Submit a request to the Get Routes endpoint.
        params: Dictionary of query parameters for the search.
        return: The response from the API."""
        return await self._async_api_request(
            lambda: self.async_get("/routes", params=params)
        )

    async def async_get_destinations(self, params: dict) -> dict:
        """
        Submit a request to the Get Destinations endpoint.
        params: Dictionary of query parameters for the search.
        return: The response from the API.
        """
        return await self._async_api_request(
            lambda: self.async_get("/destinations", params=params)
        )

    async def async_get_availability(self, params: dict) -> dict:
        """
        Submit a request to the Get Availability endpoint.
        params: Dictionary of query parameters for the search.
        return: The response from the API.
        """
        return await self._async_api_request(
            lambda: self.async_get("/availability", params=params)
        )

    async def async_get_alerts(self) -> dict:
        """
        Submit a request to the Get Alerts endpoint.
        return: The response from the API.
        """
        return await self._async_api_request(lambda: self.async_get("/alerts"))

    async def async_live_search(self, payload: dict) -> dict:
        """
        Submit a request to the Live Search endpoint.
        payload: Dictionary of the request body for the search.
        return: The response from the API."""
        return await self._async_api_request(
            lambda: self.async_post("/live", payload=payload)
        )

    async def async_refresh_cached_data(self, payload: dict) -> dict:
        """Submit a request to the Refresh Cached Data endpoint.
        payload: Dictionary of the request body for the refresh.
        return: The response from the API.
        """
        return await self._async_api_request(
            lambda: self.async_post("/refresh", payload=payload)
        )

    def _sync_api_request(self, request) -> dict:
        """Submit a synchronous API request with shared error handling.

        Register usage with rate limiter after a successful request or an HTTP status error, logs
        known

        Raises:
            APIStatusError: If the API returns a non-success HTTP status.
            APITimeout: If the request times out.
            APIRouterError: If the request fails at the router or network layer.
            Exception: Re-raises any other error raised by the request.
        """
        try:
            result = request()
            self.record_usage(1)
            return result
        except APIStatusError as e:
            logger.error("API request failed with status %s", e.status_code)
            self.record_usage(1)
            raise
        except APITimeout:
            logger.error("API request timed out")
            raise
        except APIRouterError:
            logger.error("API router error")
            raise
        except Exception:
            logger.exception("Unknown API request error")
            raise

    def cached_search(self, params: dict) -> dict:
        """Synchronous wrapper for async_cached_search, submit a request to the Cached Search endpoint.
        params: Dictionary of query parameters for the search.
        return: The response from the API.
        raises APIRouterError, APIStatusError, APITimeout.
        """
        return self._sync_api_request(lambda: self.get("/search", params=params))

    def get_trips(self, trip_id, params={}) -> dict:
        """Synchronous wrapper for async_get_trips, submit a request to the Get Trips endpoint.
        trip_id: The ID of the trip to retrieve (path variable).
        params: Dictionary of query parameters for the search.
        return: The response from the API.
        raises APIRouterError, APIStatusError, APITimeout.
        """
        return self._sync_api_request(
            lambda: self.get(f"/trips/{trip_id}", params=params)
        )

    def get_routes(self, params: dict) -> dict:
        """Synchronous wrapper for async_get_routes, submit a request to the Get Routes endpoint.
        params: Dictionary of query parameters for the search.
        return: The response from the API.
        raises APIRouterError, APIStatusError, APITimeout.
        """
        return self._sync_api_request(lambda: self.get("/routes", params=params))

    def get_destinations(self, params: dict) -> dict:
        """Synchronous wrapper for async_get_destinations, submit a request to the Get Destinations endpoint.
        params: Dictionary of query parameters for the search.
        return: The response from the API.
        raises APIRouterError, APIStatusError, APITimeout.
        """
        return self._sync_api_request(lambda: self.get("/destinations", params=params))

    def get_availability(self, params: dict) -> dict:
        """Synchronous wrapper for async_get_availability, submit a request to the Get Availability endpoint.
        params: Dictionary of query parameters for the search.
        return: The response from the API.
        raises APIRouterError, APIStatusError, APITimeout.
        """
        return self._sync_api_request(lambda: self.get("/availability", params=params))

    def get_alerts(self) -> dict:
        """Synchronous wrapper for async_get_alerts, submit a request to the Get Alerts endpoint.
        return: The response from the API.
        raises APIRouterError, APIStatusError, APITimeout.
        """
        return self._sync_api_request(lambda: self.get("/alerts"))

    def live_search(self, payload: dict) -> dict:
        """Synchronous wrapper for async_live_search, submit a request to the Live Search endpoint.
        payload: Dictionary of the request body for the search.
        return: The response from the API.
        raises APIRouterError, APIStatusError, APITimeout.
        """
        return self._sync_api_request(lambda: self.post("/live", payload=payload))

    def refresh_cached_data(self, payload: dict) -> dict:
        """Synchronous wrapper for async_refresh_cached_data, submit a request to the Refresh Cached Data endpoint.
        payload: Dictionary of the request body for the refresh.
        return: The response from the API.
        raises APIRouterError, APIStatusError, APITimeout.
        """
        return self._sync_api_request(lambda: self.post("/refresh", payload=payload))

    def cached_search_to_client_json(self, params: dict)-> dict:
        resp_raw = self.cached_search(params=params)
        resp = RawCachedSearchResponse.model_validate(resp_raw)
        return resp.to_client_json()
    