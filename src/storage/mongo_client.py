from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from config.settings import settings

_client: AsyncIOMotorClient | None = None


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(
            settings.mongo_uri,
            serverSelectionTimeoutMS=settings.mongo_server_selection_timeout_ms,
            uuidRepresentation="standard",
        )
    return _client


def get_raw_db() -> AsyncIOMotorDatabase:
    return get_client()[settings.mongo_db_raw]


def get_pii_db() -> AsyncIOMotorDatabase:
    return get_client()[settings.mongo_db_pii]


async def close_client() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None
