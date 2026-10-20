from .api_exceptions import APIRouterError, APIStatusError, APITimeout
from .seatsaero import SeatsAeroAPI
import threading
import asyncio
import atexit

# Flask manages ONE persistent event loop for the lifetime of the server
_loop = asyncio.new_event_loop()
threading.Thread(target=_loop.run_forever, daemon=True).start()


def async_run(coro):
    """Submit a coroutine to the persistent background event loop and wait for its result."""
    return asyncio.run_coroutine_threadsafe(coro, _loop).result()


seatsaero_api = SeatsAeroAPI()


@atexit.register
def _shutdown():
    async_run(seatsaero_api.close())
    _loop.call_soon_threadsafe(_loop.stop)
