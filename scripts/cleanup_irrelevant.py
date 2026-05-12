"""Purge documents from non-MH subreddits that were ingested before the relevance filter.

Safe to run repeatedly. Asks for confirmation before deleting.

Usage:  python scripts/cleanup_irrelevant.py
        python scripts/cleanup_irrelevant.py --yes    (skip confirmation)
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from src.storage.mongo_client import close_client, get_raw_db


async def main(skip_confirm: bool) -> None:
    db = get_raw_db()
    posts = db["posts"]

    n = await posts.count_documents({"subreddit_category": "general"})
    if n == 0:
        print("No irrelevant posts found. Nothing to purge.")
        await close_client()
        return

    print(f"Found {n} documents in 'general' subreddits (sample below):")
    sample = await posts.find(
        {"subreddit_category": "general"},
        {"subreddit": 1, "type": 1, "created_at": 1},
    ).limit(5).to_list(length=5)
    for d in sample:
        print(f"  - r/{d['subreddit']:25}  {d['type']:11}  {d['created_at'].isoformat()[:10]}")

    if not skip_confirm:
        ans = input(f"\nDelete all {n} irrelevant posts? [y/N]: ").strip().lower()
        if ans != "y":
            print("Aborted.")
            await close_client()
            return

    result = await posts.delete_many({"subreddit_category": "general"})
    print(f"Deleted {result.deleted_count} documents.")

    remaining = await posts.count_documents({})
    print(f"Posts remaining: {remaining}")

    await close_client()


if __name__ == "__main__":
    asyncio.run(main(skip_confirm="--yes" in sys.argv))
