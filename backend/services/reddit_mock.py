import json
from pathlib import Path

_DATA_PATH = Path(__file__).parent.parent.parent / "data" / "mock_reddit_posts.json"
_data: dict = {}


def _load():
    global _data
    if not _data:
        with open(_DATA_PATH) as f:
            _data = json.load(f)


def get_posts_for_user(user_id: str) -> dict:
    """
    Returns {"user_id": ..., "posts": [{"date", "subreddit", "text"}]}
    Raises KeyError if user_id not found (caller should return 404).
    """
    _load()
    if user_id not in _data:
        raise KeyError(user_id)
    entry = _data[user_id]
    return {
        "user_id": user_id,
        "posts": entry["posts"],
        "_meta": {
            "username": entry["username"],
            "emergency_contacts": entry.get("emergency_contacts", []),
            "connections": entry.get("connections", []),
        },
    }


def list_user_ids() -> list[str]:
    _load()
    return list(_data.keys())
