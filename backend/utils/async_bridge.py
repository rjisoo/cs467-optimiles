import threading
import asyncio
import atexit

# Citation: the following solution is adopted from this blog post found here: https://koladefaj.hashnode.dev/running-async-python-inside-celery-is-harder-than-you-think

# Maintains a persistant event_loop on another thread to to maintain the continuity of daemon-like async tasks (eg rate limiter's periodic saves)
_loop = asyncio.new_event_loop()
_thread_api = threading.Thread(target=_loop.run_forever, daemon=True)
_thread_api.start()


def bridge_run(coro):
    """Submit a coroutine to the persistent event loop and return results"""
    return asyncio.run_coroutine_threadsafe(coro, _loop).result(timeout=300)

@atexit.register
def _shutdown():
    _loop.call_soon_threadsafe(_loop.stop)

#Logger Setup