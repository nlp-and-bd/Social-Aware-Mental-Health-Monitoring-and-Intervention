from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone
from backend.config import settings

_client: AsyncIOMotorClient = None
_db = None


def get_db():
    return _db


async def connect():
    global _client, _db
    _client = AsyncIOMotorClient(settings.MONGODB_URI, serverSelectionTimeoutMS=5000)
    _db = _client[settings.MONGODB_DB]
    await _db.command("ping")  # fail fast if credentials / network are wrong
    await _db["posts"].create_index("user_id")
    await _db["users"].create_index("severity_label")
    await _db["posts"].create_index([("user_id", 1), ("severity", 1)])  # compound for classify


async def close():
    if _client:
        _client.close()


# --- Users ---

async def get_user(user_id: str) -> dict | None:
    return await _db["users"].find_one({"_id": user_id})


async def upsert_user(user_id: str, username: str, emergency_contacts: list, connections: list):
    now = datetime.now(timezone.utc).isoformat()
    await _db["users"].update_one(
        {"_id": user_id},
        {"$setOnInsert": {
            "_id": user_id,
            "username": username,
            "severity_score": 0.0,
            "severity_label": "Low",
            "severity_history": [],
            "emergency_contacts": emergency_contacts,
            "connections": [{"peer_id": c, "weight": 1.0} for c in connections],
            "post_ids": [],
            "chat_history": [],
            "notifications": [],
            "consent_given": False,
            "last_active": now,
            "created_at": now,
        }},
        upsert=True,
    )


async def set_consent(user_id: str, username: str, emergency_contacts: list):
    await _db["users"].update_one(
        {"_id": user_id},
        {"$set": {
            "consent_given": True,
            "username": username,
            "emergency_contacts": [c if isinstance(c, dict) else c.model_dump() for c in emergency_contacts],
        }},
    )


async def update_severity(user_id: str, label: str, score: float):
    now = datetime.now(timezone.utc).isoformat()
    entry = {"label": label, "score": round(score, 4), "timestamp": now}
    await _db["users"].update_one(
        {"_id": user_id},
        {"$set": {"severity_label": label, "severity_score": round(score, 4), "last_active": now},
         "$push": {"severity_history": entry}},
    )


async def append_chat_turn(user_id: str, role: str, content: str, conversation_id: str = ""):
    now = datetime.now(timezone.utc).isoformat()
    await _db["users"].update_one(
        {"_id": user_id},
        {"$push": {"chat_history": {
            "role": role,
            "content": content,
            "timestamp": now,
            "conversation_id": conversation_id,
        }}},
    )


async def get_chat_history(user_id: str, last_n: int = 6) -> list[dict]:
    """Returns all turns for display in the UI (full history, all sessions)."""
    user = await _db["users"].find_one({"_id": user_id}, {"chat_history": 1})
    if not user:
        return []
    return user.get("chat_history", [])


async def get_session_history(user_id: str, conversation_id: str, last_n: int = 6) -> list[dict]:
    """Returns only turns from the current session — used as LLM context."""
    user = await _db["users"].find_one({"_id": user_id}, {"chat_history": 1})
    if not user:
        return []
    session = [
        t for t in user.get("chat_history", [])
        if t.get("conversation_id") == conversation_id
    ]
    return session[-last_n:]


async def add_notification(user_id: str, from_user: str, message: str):
    now = datetime.now(timezone.utc).isoformat()
    await _db["users"].update_one(
        {"_id": user_id},
        {"$push": {"notifications": {"from_user": from_user, "message": message, "timestamp": now}}},
    )


async def pop_notifications(user_id: str) -> list[dict]:
    user = await _db["users"].find_one({"_id": user_id}, {"notifications": 1})
    if not user:
        return []
    notifications = user.get("notifications", [])
    if notifications:
        await _db["users"].update_one({"_id": user_id}, {"$set": {"notifications": []}})
    return notifications


async def get_emergency_contacts(user_id: str) -> list[dict]:
    user = await _db["users"].find_one({"_id": user_id}, {"emergency_contacts": 1})
    if not user:
        return []
    return user.get("emergency_contacts", [])


async def get_connections(user_id: str) -> list[dict]:
    user = await _db["users"].find_one({"_id": user_id}, {"connections": 1})
    if not user:
        return []
    return user.get("connections", [])


async def update_contacts(user_id: str, contacts: list[dict]):
    await _db["users"].update_one(
        {"_id": user_id},
        {"$set": {"emergency_contacts": contacts}},
    )


async def clear_user_posts(user_id: str):
    await _db["posts"].delete_many({"user_id": user_id})
    await _db["users"].update_one(
        {"_id": user_id},
        {"$set": {
            "post_ids": [],
            "severity_score": 0.0,
            "severity_label": "Low",
            "severity_history": [],
        }},
    )


async def delete_user(user_id: str):
    await _db["posts"].delete_many({"user_id": user_id})
    await _db["users"].delete_one({"_id": user_id})


# --- Posts ---

async def upsert_post(post_id: str, user_id: str, date: str, subreddit: str, text: str):
    await _db["posts"].update_one(
        {"_id": post_id},
        {"$setOnInsert": {
            "_id": post_id,
            "user_id": user_id,
            "date": date,
            "subreddit": subreddit,
            "text": text,
            "severity": None,
            "confidence": None,
            "classified_at": None,
        }},
        upsert=True,
    )
    await _db["users"].update_one(
        {"_id": user_id},
        {"$addToSet": {"post_ids": post_id}},
    )


async def get_unclassified_posts(user_id: str) -> list[dict]:
    cursor = _db["posts"].find({"user_id": user_id, "severity": None})
    return await cursor.to_list(length=None)


async def get_all_posts(user_id: str) -> list[dict]:
    cursor = _db["posts"].find({"user_id": user_id})
    return await cursor.to_list(length=None)


async def update_post_severity(post_id: str, severity: str, confidence: float):
    now = datetime.now(timezone.utc).isoformat()
    await _db["posts"].update_one(
        {"_id": post_id},
        {"$set": {"severity": severity, "confidence": round(confidence, 4), "classified_at": now}},
    )


async def vector_search(
    query_vector: list[float],
    collection: str,
    index: str,
    field: str,
    n: int = 3,
) -> list[dict]:
    """Atlas $vectorSearch — only works when the teammate's vector index is live."""
    pipeline = [
        {
            "$vectorSearch": {
                "index": index,
                "path": field,
                "queryVector": query_vector,
                "numCandidates": n * 10,
                "limit": n,
            }
        },
        {
            "$project": {
                "content": 1,
                "title": 1,
                "category": 1,
                "_id": 0,
            }
        },
    ]
    cursor = _db[collection].aggregate(pipeline)
    return await cursor.to_list(length=None)


async def get_all_users() -> list[dict]:
    cursor = _db["users"].find({}, {"chat_history": 0, "notifications": 0})
    return await cursor.to_list(length=None)


# --- Graph ---

async def get_graph_data(user_id: str) -> tuple[list[dict], list[dict]]:
    ego = await _db["users"].find_one({"_id": user_id})
    if not ego:
        return [], []

    peer_ids = [c["peer_id"] for c in ego.get("connections", [])]
    peers_cursor = _db["users"].find({"_id": {"$in": peer_ids}})
    peers = await peers_cursor.to_list(length=None)

    all_users = [ego] + peers
    nodes = [
        {
            "id": u["_id"],
            "data": {
                "label": u.get("username", u["_id"]),
                "severity": u.get("severity_label", "Low"),
                "score": u.get("severity_score", 0.0),
            },
        }
        for u in all_users
    ]

    edges = [
        {
            "id": f"e-{user_id}-{c['peer_id']}",
            "source": user_id,
            "target": c["peer_id"],
            "data": {"weight": c.get("weight", 1.0)},
        }
        for c in ego.get("connections", [])
    ]

    return nodes, edges
