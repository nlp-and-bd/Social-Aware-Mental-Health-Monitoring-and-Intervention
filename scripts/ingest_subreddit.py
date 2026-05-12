"""Ingest recent posts + comments from one or more MH subreddits.

Usage:
  python scripts/ingest_subreddit.py mentalhealth
  python scripts/ingest_subreddit.py depression anxiety mentalhealth --limit 30
  python scripts/ingest_subreddit.py depression --limit 50 --no-comments
"""
import argparse
import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from src.api.dependencies import get_repository, get_vault
from src.ingestion.cleaner import categorize_subreddit, is_relevant_subreddit
from src.ingestion.fetcher import SubredditUnavailable, fetch_subreddit
from src.ingestion.reddit_client import build_reddit_client
from src.storage.indexes import ensure_pii_indexes, ensure_raw_indexes
from src.storage.mongo_client import close_client, get_pii_db, get_raw_db


async def ingest_one(reddit, repo, vault, name: str, limit: int, include_comments: bool, sort: str) -> dict:
    name = name.strip().lstrip("r/").lstrip("/")
    if not is_relevant_subreddit(name):
        print(f"  SKIP r/{name} - not in MH taxonomy. Add to config/subreddit_taxonomy.yaml first.")
        return {"upserted": 0, "skipped": True}

    print(f"\n--- r/{name} (category: {categorize_subreddit(name)}) ---")
    fetched_at = datetime.now(timezone.utc)

    try:
        items, authors_map = await fetch_subreddit(
            reddit, name,
            submissions_limit=limit,
            comments_limit=limit,
            sort=sort,
            include_comments=include_comments,
        )
    except SubredditUnavailable as e:
        print(f"  ERROR: {e}")
        return {"upserted": 0, "error": str(e)}

    print(f"  fetched: {len(items)} items from {len(authors_map)} unique authors")

    encrypted = [(h, vault.encrypt(n)) for h, n in authors_map.items()]
    new_pii = await repo.bulk_upsert_observed_users(encrypted)
    await repo.bulk_touch_users(list(authors_map.keys()))
    print(f"  enrolled: {new_pii} new authors into mh_pii.user_map")

    upserted, skipped = await repo.upsert_posts(items)
    crisis = sum(1 for i in items if i.get("crisis_keywords_hit"))

    await repo.write_subreddit_audit({
        "subreddit": name,
        "fetched_at": fetched_at,
        "items_fetched": len(items),
        "items_upserted": upserted,
        "unique_authors": len(authors_map),
        "api_remaining": reddit.auth.limits.get("remaining"),
    })

    print(f"  upserted: {upserted}  skipped: {skipped}  crisis_hits: {crisis}")
    print(f"  api_remaining: {reddit.auth.limits.get('remaining')}")
    return {"upserted": upserted, "crisis": crisis}


async def main(subreddits: list[str], limit: int, include_comments: bool, sort: str) -> None:
    print("=== Subreddit ingestion ===")
    await ensure_raw_indexes(get_raw_db())
    await ensure_pii_indexes(get_pii_db())

    repo = get_repository()
    vault = get_vault()
    reddit = build_reddit_client()

    total_upserted = 0
    total_crisis = 0
    try:
        for name in subreddits:
            r = await ingest_one(reddit, repo, vault, name, limit, include_comments, sort)
            total_upserted += r.get("upserted", 0)
            total_crisis += r.get("crisis", 0)
    finally:
        await reddit.close()
        await close_client()

    print(f"\n=== Done. Total upserted: {total_upserted}  total crisis hits: {total_crisis} ===")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("subreddits", nargs="+", help="One or more subreddit names (no r/ prefix)")
    p.add_argument("--limit", type=int, default=50, help="Max submissions and max comments per sub (default 50)")
    p.add_argument("--no-comments", action="store_true", help="Skip comments, fetch only submissions")
    p.add_argument("--sort", choices=["new", "hot", "top", "rising"], default="new")
    args = p.parse_args()

    asyncio.run(main(args.subreddits, args.limit, not args.no_comments, args.sort))
