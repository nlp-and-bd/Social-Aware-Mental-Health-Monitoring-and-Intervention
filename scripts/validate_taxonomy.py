"""Verify every subreddit in config/subreddit_taxonomy.yaml exists on Reddit
and report subscriber counts. Run this whenever the taxonomy is edited.

Usage:  python scripts/validate_taxonomy.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from asyncprawcore.exceptions import Forbidden, NotFound, Redirect

from src.ingestion.cleaner import _SUBREDDIT_CATEGORY
from src.ingestion.reddit_client import build_reddit_client


async def main() -> None:
    reddit = build_reddit_client()
    bad: list[tuple[str, str, str]] = []
    private: list[str] = []
    small: list[tuple[str, str, int]] = []
    ok = 0

    print(f"Validating {len(_SUBREDDIT_CATEGORY)} subreddits...\n")
    try:
        for name, category in sorted(_SUBREDDIT_CATEGORY.items()):
            try:
                sub = await reddit.subreddit(name, fetch=True)
                subs = sub.subscribers or 0
                if subs < 500:
                    small.append((name, category, subs))
                ok += 1
            except (NotFound, Redirect):
                bad.append((name, category, "does not exist"))
            except Forbidden:
                private.append(name)
            except Exception as e:  # noqa: BLE001
                bad.append((name, category, f"{type(e).__name__}: {e}"))
    finally:
        await reddit.close()

    print(f"OK:           {ok}")
    print(f"Missing:      {len(bad)}")
    print(f"Private:      {len(private)}")
    print(f"Small (<500): {len(small)}")

    if bad:
        print("\n--- REMOVE FROM TAXONOMY (do not exist) ---")
        for n, c, why in bad:
            print(f"  [{c}] {n}: {why}")
    if private:
        print("\n--- PRIVATE/QUARANTINED (cannot ingest) ---")
        for n in private:
            print(f"  {n}")
    if small:
        print("\n--- LOW VOLUME (consider removing) ---")
        for n, c, s in small:
            print(f"  [{c}] {n}: {s} subscribers")


if __name__ == "__main__":
    asyncio.run(main())
