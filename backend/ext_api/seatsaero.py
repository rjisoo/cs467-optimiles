from .api_template import APIRouterTemplate
import dotenv
import os
import time
import asyncio
import dotenv


dotenv.load_dotenv()


class SeatsAeroAPI(APIRouterTemplate):
    def __init__(self,
            timeout: float = 10.0,
        ):
        base_url=os.getenv("SEATSAERO_BASE_URL")
        if base_url is None:
             raise Exception("Wrong!")
        super().__init__(api_name="seatsaero",base_url=os.getenv("SEATSAERO_BASE_URL"))
        self.oauth=False
        search_cache={
        }
        search_cache_example={
             "cursor_idxxx":{
                "ttl":"sometime",
                "results":[
                  "someresult1","2"
                ]
             }
        }
        self.cache_lock=asyncio.Lock()
        self._auth()

    def _auth(self):
            if "Partner-Authorization" not in self.default_headers:
                self.default_headers["Partner-Authorization"] = os.getenv("SEATSAERO_TOKEN")

    async def cache_search(self, params):
        async with self.cache_lock:
            return await self.get("/search",params=params)

    async def get_trips(self, path_id, params={}):
        async with self.cache_lock:
            return await self.get(f"/trips/{path_id}",params=params)
        
    async def get_routes(self,params):
        async with self.cache_lock:
                    return await self.get("/routes",params=params)
    
    @staticmethod
    def process_flight_info(result):
         pass


