import hashlib


def hash_username(username: str) -> str:
    return hashlib.sha256(username.strip().lower().encode("utf-8")).hexdigest()
