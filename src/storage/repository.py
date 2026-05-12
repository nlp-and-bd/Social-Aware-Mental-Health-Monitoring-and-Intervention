from datetime import datetime, timezone
from typing import Any

from pymongo import UpdateOne


class PostsRepository:
    def __init__(self, raw_db, pii_db) -> None:
        self.posts = raw_db["posts"]
        self.users = raw_db["users"]
        self.audit = raw_db["fetch_audit"]
        self.user_map = pii_db["user_map"]

    async def upsert_user_pii(self, user_id_hash: str, username_encrypted: str) -> None:
        await self.user_map.update_one(
            {"_id": user_id_hash},
            {
                "$setOnInsert": {
                    "_id": user_id_hash,
                    "username_encrypted": username_encrypted,
                    "consented_at": datetime.now(timezone.utc),
                    "consent_scope": ["ingest", "analyze"],
                    "consent_version": "1.0",
                    "enrollment_source": "user_request",
                }
            },
            upsert=True,
        )

    async def bulk_upsert_observed_users(
        self, encrypted_authors: list[tuple[str, str]]
    ) -> int:
        """Bulk-enroll authors discovered via subreddit ingest.

        encrypted_authors = [(user_id_hash, username_encrypted), ...]
        Uses $setOnInsert so existing user_request enrollees are NOT downgraded
        to subreddit_observed.
        """
        if not encrypted_authors:
            return 0
        now = datetime.now(timezone.utc)
        ops = [
            UpdateOne(
                {"_id": h},
                {
                    "$setOnInsert": {
                        "_id": h,
                        "username_encrypted": e,
                        "consented_at": None,           # observational - no explicit consent
                        "consent_scope": ["analyze"],   # research only - NOT peer_notify
                        "consent_version": "1.0",
                        "enrollment_source": "subreddit_observed",
                        "first_observed_at": now,
                    }
                },
                upsert=True,
            )
            for h, e in encrypted_authors
        ]
        result = await self.user_map.bulk_write(ops, ordered=False)
        return (result.upserted_count or 0)

    async def bulk_touch_users(self, user_id_hashes: list[str]) -> None:
        if not user_id_hashes:
            return
        now = datetime.now(timezone.utc)
        ops = [
            UpdateOne(
                {"_id": h},
                {
                    "$set": {"status": "active"},
                    "$setOnInsert": {
                        "_id": h,
                        "first_seen": now,
                        "monitoring_tier": "low",
                        "enrollment_source": "subreddit_observed",
                    },
                },
                upsert=True,
            )
            for h in user_id_hashes
        ]
        await self.users.bulk_write(ops, ordered=False)

    async def write_subreddit_audit(self, doc: dict) -> None:
        await self.audit.insert_one({**doc, "audit_type": "subreddit"})

    async def upsert_user(self, user_id_hash: str, last_fetched_utc: float) -> None:
        now = datetime.now(timezone.utc)
        await self.users.update_one(
            {"_id": user_id_hash},
            {
                "$set": {"last_fetched_utc": last_fetched_utc, "status": "active"},
                "$setOnInsert": {
                    "_id": user_id_hash,
                    "first_seen": now,
                    "monitoring_tier": "low",
                },
            },
            upsert=True,
        )

    async def get_last_fetched_utc(self, user_id_hash: str) -> float | None:
        doc = await self.users.find_one({"_id": user_id_hash}, {"last_fetched_utc": 1})
        return doc.get("last_fetched_utc") if doc else None

    async def upsert_posts(self, items: list[dict]) -> tuple[int, int]:
        """Bulk upsert. Returns (upserted_count, skipped_count).

        Items with `_skip_reason` set are NOT written to posts (preserves audit
        info via fetch_audit instead).
        """
        ops: list[UpdateOne] = []
        skipped = 0
        for item in items:
            if item.pop("_skip_reason", None):
                skipped += 1
                continue
            doc_id = item["_id"]
            ops.append(UpdateOne({"_id": doc_id}, {"$set": item}, upsert=True))

        if not ops:
            return (0, skipped)

        result = await self.posts.bulk_write(ops, ordered=False)
        upserted = (result.upserted_count or 0) + (result.modified_count or 0)
        return (upserted, skipped)

    async def write_audit(self, audit_doc: dict[str, Any]) -> None:
        await self.audit.insert_one(audit_doc)

    async def list_user_posts(
        self, user_id_hash: str, *, limit: int = 200
    ) -> list[dict]:
        cursor = (
            self.posts.find({"user_id_hash": user_id_hash})
            .sort("created_utc", -1)
            .limit(limit)
        )
        return await cursor.to_list(length=limit)

    async def delete_user(self, user_id_hash: str) -> dict[str, int]:
        """Right-to-be-forgotten: purge all traces of a user.

        Returns counts of deleted documents per collection.
        """
        posts_res = await self.posts.delete_many({"user_id_hash": user_id_hash})
        users_res = await self.users.delete_one({"_id": user_id_hash})
        pii_res = await self.user_map.delete_one({"_id": user_id_hash})
        audit_res = await self.audit.delete_many({"user_id_hash": user_id_hash})
        return {
            "posts": posts_res.deleted_count,
            "users": users_res.deleted_count,
            "pii": pii_res.deleted_count,
            "audit": audit_res.deleted_count,
        }
