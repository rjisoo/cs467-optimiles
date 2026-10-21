import atexit
from utils import bridge_run

from .api_exceptions import APIRouterError, APIStatusError, APITimeout
from .seatsaero import SeatsAeroAPI

seatsaero_api = SeatsAeroAPI()

@atexit.register
def _shutdown():
    bridge_run(seatsaero_api.close())
