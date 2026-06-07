"""Real Reddit post fetching (app-only asyncpraw) — same get_posts_for_user contract as reddit_mock."""
from datetime import datetime, timedelta, timezone

import asyncpraw
from asyncprawcore.exceptions import Forbidden, NotFound

from backend.config import settings
from backend.services import text_cleaner


class UserNotFound(Exception):
    pass


class UserSuspended(Exception):
    pass


def build_reddit_client() -> asyncpraw.Reddit:
    return asyncpraw.Reddit(
        client_id=settings.REDDIT_CLIENT_ID,
        client_secret=settings.REDDIT_CLIENT_SECRET,
        user_agent=settings.REDDIT_USER_AGENT,
    )


def recent_window_floor() -> float:
    return (
        datetime.now(timezone.utc)
        - timedelta(days=settings.REDDIT_RECENT_WINDOW_DAYS)
    ).timestamp()


def compute_since_utc(last_fetched: float | None) -> float:
    floor = recent_window_floor()
    if last_fetched is None:
        return floor
    return max(last_fetched, floor)


def _to_post(created_utc: float, subreddit: str, text: str, fullname: str) -> dict:
    return {
        "date": datetime.fromtimestamp(created_utc, tz=timezone.utc).strftime("%Y-%m-%d"),
        "subreddit": subreddit.lower(),
        "text": text,
        "created_utc": float(created_utc),
        "fullname": fullname,
    }


async def fetch_user(
    reddit: asyncpraw.Reddit,
    username: str,
    *,
    submissions_limit: int | None = 200,
    comments_limit: int | None = 200,
    since_utc: float | None = None,
    include_all_subreddits: bool = False,
) -> list[dict]:
    posts: list[dict] = []

    try:
        redditor = await reddit.redditor(username, fetch=True)
    except NotFound as e:
        raise UserNotFound(f"Reddit user '{username}' does not exist") from e
    except Forbidden as e:
        raise UserSuspended(f"Reddit user '{username}' is suspended or private") from e

    try:
        async for sub in redditor.submissions.new(limit=submissions_limit):
            if since_utc and float(sub.created_utc) <= since_utc:
                break
            sub_name = str(sub.subreddit)
            if not include_all_subreddits and not text_cleaner.is_relevant_subreddit(sub_name):
                continue
            title = sub.title or ""
            body = sub.selftext or ""
            full = f"{title}\n\n{body}".strip() if body else title
            result = text_cleaner.process(full)
            if not result.keep:
                continue
            posts.append(_to_post(sub.created_utc, sub_name, result.text, sub.fullname))
    except Forbidden as e:
        raise UserSuspended(f"Cannot read submissions for '{username}'") from e

    try:
        async for cm in redditor.comments.new(limit=comments_limit):
            if since_utc and float(cm.created_utc) <= since_utc:
                break
            sub_name = str(cm.subreddit)
            if not include_all_subreddits and not text_cleaner.is_relevant_subreddit(sub_name):
                continue
            result = text_cleaner.process(cm.body or "")
            if not result.keep:
                continue
            posts.append(_to_post(cm.created_utc, sub_name, result.text, cm.fullname))
    except Forbidden as e:
        raise UserSuspended(f"Cannot read comments for '{username}'") from e

    return posts


async def get_posts_for_user(
    username: str,
    *,
    last_fetched: float | None = None,
    include_all_subreddits: bool = False,
) -> dict:
    since_utc = compute_since_utc(last_fetched)
    reddit = build_reddit_client()
    try:
        posts = await fetch_user(
            reddit,
            username,
            since_utc=since_utc,
            include_all_subreddits=include_all_subreddits,
        )
    except UserNotFound as e:
        raise KeyError(username) from e
    finally:
        await reddit.close()

    return {
        "user_id": username,
        "posts": posts,
        "_meta": {
            "username": username,
            "emergency_contacts": [],
            "connections": [],
        },
    }
