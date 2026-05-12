from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING

from config.settings import settings


async def ensure_raw_indexes(db: AsyncIOMotorDatabase) -> None:
    posts = db["posts"]
    await posts.create_index([("user_id_hash", ASCENDING)])
    await posts.create_index([("user_id_hash", ASCENDING), ("created_utc", DESCENDING)])
    await posts.create_index([("_phase3_status", ASCENDING)])
    await posts.create_index([("crisis_keywords_hit", ASCENDING)])
    await posts.create_index([("subreddit", ASCENDING)])
    await posts.create_index([("subreddit_category", ASCENDING)])
    # Right-to-be-forgotten: auto-purge after configured retention period.
    # The name was 'ttl_two_years' in 1.0.0 - drop if present so we can rename.
    existing = await posts.index_information()
    if "ttl_two_years" in existing and "ttl_retention" not in existing:
        await posts.drop_index("ttl_two_years")
    await posts.create_index(
        [("created_at", ASCENDING)],
        expireAfterSeconds=settings.posts_retention_days * 24 * 3600,
        name="ttl_retention",
    )

    users = db["users"]
    await users.create_index([("monitoring_tier", ASCENDING)])
    await users.create_index([("enrollment_source", ASCENDING)])

    audit = db["fetch_audit"]
    await audit.create_index([("user_id_hash", ASCENDING), ("fetched_at", DESCENDING)])
    await audit.create_index([("subreddit", ASCENDING), ("fetched_at", DESCENDING)])
    await audit.create_index([("audit_type", ASCENDING), ("fetched_at", DESCENDING)])


async def ensure_pii_indexes(db: AsyncIOMotorDatabase) -> None:
    user_map = db["user_map"]
    await user_map.create_index([("enrollment_source", ASCENDING)])
