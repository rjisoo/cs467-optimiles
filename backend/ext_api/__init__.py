import atexit
from backend.utils import bridge_run
from .api_exceptions import *
from .seatsaero import SeatsAeroAPI
from .reward_eval import (
    init_reward_eval,
    get_all_reward_info,
    get_reward_value,
    get_banks,
)

seatsaero_api = SeatsAeroAPI()
init_reward_eval()


@atexit.register
def _shutdown():
    bridge_run(seatsaero_api.close())
