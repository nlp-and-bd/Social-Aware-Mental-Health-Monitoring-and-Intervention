from functools import lru_cache

from src.privacy.encryption import UsernameVault
from src.storage.mongo_client import get_pii_db, get_raw_db
from src.storage.repository import PostsRepository


@lru_cache(maxsize=1)
def get_vault() -> UsernameVault:
    return UsernameVault()


def get_repository() -> PostsRepository:
    return PostsRepository(raw_db=get_raw_db(), pii_db=get_pii_db())
