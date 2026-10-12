"""MongoDB connection (shared, created once)."""
from functools import lru_cache

from pymongo import MongoClient
from pymongo.database import Database
from pymongo.errors import ConfigurationError

from . import config


@lru_cache(maxsize=1)
def get_db() -> Database:
    client = MongoClient(config.MONGO_URI, serverSelectionTimeoutMS=10_000, appname="hospisync-ai")
    try:
        return client.get_default_database()  # the "/hospisync" part of MONGO_URI
    except ConfigurationError as err:
        raise RuntimeError('MONGO_URI must include the database name, e.g. ".../hospisync?..."') from err