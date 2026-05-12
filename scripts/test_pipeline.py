import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Windows console (cp1252) can't print arbitrary Unicode - reconfigure to UTF-8
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from src.api.dependencies import get_repository, get_vault
from src.ingestion.fetcher import fetch_user
from src.ingestion.reddit_client import build_reddit_client
from src.privacy.hashing import hash_username
from src.storage.indexes import ensure_pii_indexes, ensure_raw_indexes
from src.storage.mongo_client import close_client, get_pii_db, get_raw_db


async def main(username: str) -> None:
    print(f"=== Phase 1 end-to-end test for u/{username} ===\n")

    print("[1/5] Ensuring Mongo indexes...")
    await ensure_raw_indexes(get_raw_db())
    await ensure_pii_indexes(get_pii_db())

    print("[2/5] Encrypting username for mh_pii.user_map...")
    repo = get_repository()
    vault = get_vault()
    user_id_hash = hash_username(username)
    await repo.upsert_user_pii(user_id_hash, vault.encrypt(username))
    print(f"      user_id_hash = {user_id_hash[:16]}...")

    print("[3/5] Fetching from Reddit (10 submissions + 10 comments)...")
    reddit = build_reddit_client()
    try:
        items = await fetch_user(
            reddit, username, submissions_limit=10, comments_limit=10
        )
    finally:
        await reddit.close()

    kept = [i for i in items if not i.get("_skip_reason")]
    skipped = [i for i in items if i.get("_skip_reason")]
    crisis = [i for i in items if i.get("crisis_keywords_hit")]
    print(f"      fetched={len(items)}  kept={len(kept)}  skipped={len(skipped)}  crisis_hits={len(crisis)}")
    if skipped:
        from collections import Counter
        reasons = Counter(i["_skip_reason"] for i in skipped)
        print(f"      skip reasons: {dict(reasons)}")

    print("[4/5] Upserting into mh_raw.posts...")
    upserted, n_skipped = await repo.upsert_posts(items)
    if items:
        await repo.upsert_user(user_id_hash, max(i["created_utc"] for i in items))
    print(f"      upserted={upserted}  skipped={n_skipped}")

    print("[5/5] Reading back from Mongo...")
    docs = await repo.list_user_posts(user_id_hash, limit=5)
    for d in docs:
        sub = d.get("subreddit")
        ts = d.get("created_at")
        text = (d.get("text") or "")[:80].replace("\n", " ")
        print(f"      [{ts.isoformat()[:10]}] r/{sub}: {text}")

    await close_client()
    print("\nOK - pipeline working end-to-end.")


if __name__ == "__main__":
    user = sys.argv[1] if len(sys.argv) > 1 else "spez"
    asyncio.run(main(user))
