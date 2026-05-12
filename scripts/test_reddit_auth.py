#Verify Reddit API credentials work in read-only (app-only OAuth) mode.

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import asyncpraw

from config.settings import settings


async def main() -> None:
    reddit = asyncpraw.Reddit(
        client_id=settings.reddit_client_id,
        client_secret=settings.reddit_client_secret,
        user_agent=settings.reddit_user_agent,
    )
    print(f"read_only mode: {reddit.read_only}")

    subreddit = await reddit.subreddit("depression")
    await subreddit.load()
    print(f"Reached r/{subreddit.display_name} - subscribers: {subreddit.subscribers:,}")

    print("Pulling 3 recent submissions to confirm read works...")
    count = 0
    async for sub in subreddit.new(limit=3):
        print(f"  [{sub.id}] {sub.title[:60]}")
        count += 1

    limits = reddit.auth.limits
    print(f"\nRate-limit headers: remaining={limits.get('remaining')} "
          f"reset_in={limits.get('reset')}s used={limits.get('used')}")

    await reddit.close()
    print(f"\nOK - fetched {count} items, auth working.")


if __name__ == "__main__":
    asyncio.run(main())
