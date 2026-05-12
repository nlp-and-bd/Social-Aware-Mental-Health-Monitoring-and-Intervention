from datetime import datetime, timezone

import asyncpraw
from asyncpraw.models import Comment, Redditor, Submission
from asyncprawcore.exceptions import Forbidden, NotFound

from config.settings import settings
from src.ingestion.cleaner import categorize_subreddit, is_relevant_subreddit, process
from src.privacy.hashing import hash_username

KNOWN_BOTS = {
    "automoderator", "remindmebot", "sneakpeekbot", "imguralbumbot",
    "transcribersofreddit", "savevideo", "savevideobot", "video_descriptionbot",
    "gifv-bot", "wikitextbot", "convertstometric", "youtubefactsbot",
    "the-paranoid-android", "helperbot_", "removalbot", "alphabet_order_bot",
    "good_bot_bad_bot", "totesmessenger", "anti-gif-bot", "gif-link-bot",
    "rickrolled-bot", "ayylmao2dongerbot", "tweettranscriberbot",
    "youtubelinkbot", "redditcareresources",
}


class UserNotFound(Exception):
    pass


class UserSuspended(Exception):
    pass


class SubredditUnavailable(Exception):
    pass


def _valid_author(item: Submission | Comment) -> bool:
    """True if the post has a real, non-bot, non-deleted author."""
    author = getattr(item, "author", None)
    if author is None:
        return False
    name = getattr(author, "name", None)
    if not name:
        return False
    lname = name.lower()
    if lname in KNOWN_BOTS:
        return False
    if lname.endswith("bot") and len(lname) > 4:
        return False
    return True


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_submission(sub: Submission, user_id_hash: str, *, include_all: bool) -> dict:
    sub_name = str(sub.subreddit)
    category = categorize_subreddit(sub_name)
    raw_body = sub.selftext or ""
    title = sub.title or ""

    if not include_all and not is_relevant_subreddit(sub_name):
        return {
            "_id": sub.fullname,
            "user_id_hash": user_id_hash,
            "type": "submission",
            "subreddit": sub_name,
            "subreddit_category": category,
            "created_utc": float(sub.created_utc),
            "_skip_reason": "irrelevant_subreddit",
        }

    # In baseline-study mode, retag non-MH subs as "baseline" so cleanup_irrelevant.py
    # never deletes intentionally-collected control data.
    if include_all and category == "general":
        category = "baseline"

    full_text_for_processing = f"{title}\n\n{raw_body}".strip() if raw_body else title
    result = process(full_text_for_processing)
    created = float(sub.created_utc)
    return {
        "_id": sub.fullname,                       # 't3_xxx'
        "user_id_hash": user_id_hash,
        "type": "submission",
        "subreddit": sub_name,
        "subreddit_category": category,
        "title": title,
        "text": result.text,
        "text_raw": result.text_raw,               # PII-scrubbed raw body
        "created_utc": created,
        "created_at": datetime.fromtimestamp(created, tz=timezone.utc),
        "score": int(sub.score or 0),
        "num_comments": int(sub.num_comments or 0),
        "permalink": f"https://reddit.com{sub.permalink}",
        "parent_id": None,
        "lang": result.lang,
        "flair": getattr(sub, "link_flair_text", None),
        "over_18": bool(getattr(sub, "over_18", False)),
        "is_deleted": result.skip_reason == "deleted",
        "is_edited": bool(sub.edited),
        "ingested_at": _now(),
        "ingestion_version": settings.ingestion_version,
        "crisis_keywords_hit": result.crisis_hits,
        "_phase3_status": "pending",
        "_skip_reason": result.skip_reason,
    }


def _normalize_comment(cm: Comment, user_id_hash: str, *, include_all: bool) -> dict:
    sub_name = str(cm.subreddit)
    category = categorize_subreddit(sub_name)
    raw_body = cm.body or ""

    if not include_all and not is_relevant_subreddit(sub_name):
        return {
            "_id": cm.fullname,
            "user_id_hash": user_id_hash,
            "type": "comment",
            "subreddit": sub_name,
            "subreddit_category": category,
            "created_utc": float(cm.created_utc),
            "_skip_reason": "irrelevant_subreddit",
        }

    if include_all and category == "general":
        category = "baseline"

    result = process(raw_body)
    created = float(cm.created_utc)
    return {
        "_id": cm.fullname,                        # 't1_xxx'
        "user_id_hash": user_id_hash,
        "type": "comment",
        "subreddit": sub_name,
        "subreddit_category": category,
        "title": None,
        "text": result.text,
        "text_raw": result.text_raw,               # PII-scrubbed raw body
        "created_utc": created,
        "created_at": datetime.fromtimestamp(created, tz=timezone.utc),
        "score": int(cm.score or 0),
        "num_comments": 0,
        "permalink": f"https://reddit.com{cm.permalink}" if hasattr(cm, "permalink") else "",
        "parent_id": cm.parent_id,
        "lang": result.lang,
        "flair": getattr(cm, "author_flair_text", None),
        "over_18": False,
        "is_deleted": result.skip_reason == "deleted",
        "is_edited": bool(cm.edited),
        "ingested_at": _now(),
        "ingestion_version": settings.ingestion_version,
        "crisis_keywords_hit": result.crisis_hits,
        "_phase3_status": "pending",
        "_skip_reason": result.skip_reason,
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
    """Fetch submissions + comments for a Reddit username.

    `since_utc` enables incremental fetch: stop once items are older than that timestamp.
    `include_all_subreddits=False` (default) drops posts from non-MH subreddits at the
    earliest possible point. Set True only for baseline/control studies.
    Returns normalized (but not yet stored) records. Caller filters skip_reason.
    """
    user_id_hash = hash_username(username)
    items: list[dict] = []

    try:
        redditor: Redditor = await reddit.redditor(username, fetch=True)
    except NotFound as e:
        raise UserNotFound(f"Reddit user '{username}' does not exist") from e
    except Forbidden as e:
        raise UserSuspended(f"Reddit user '{username}' is suspended or private") from e

    # Submissions
    try:
        async for sub in redditor.submissions.new(limit=submissions_limit):
            if since_utc and float(sub.created_utc) <= since_utc:
                break
            items.append(_normalize_submission(sub, user_id_hash, include_all=include_all_subreddits))
    except Forbidden as e:
        raise UserSuspended(f"Cannot read submissions for '{username}'") from e

    # Comments
    try:
        async for cm in redditor.comments.new(limit=comments_limit):
            if since_utc and float(cm.created_utc) <= since_utc:
                break
            items.append(_normalize_comment(cm, user_id_hash, include_all=include_all_subreddits))
    except Forbidden as e:
        raise UserSuspended(f"Cannot read comments for '{username}'") from e

    return items


async def fetch_subreddit(
    reddit: asyncpraw.Reddit,
    subreddit_name: str,
    *,
    submissions_limit: int = 100,
    comments_limit: int = 100,
    sort: str = "new",
    include_comments: bool = True,
) -> tuple[list[dict], dict[str, str]]:
    """Fetch recent submissions and comments from a subreddit.

    Returns (items, authors_map) where:
      - items: normalized post/comment dicts ready for upsert (each tagged with author hash)
      - authors_map: {user_id_hash: raw_username} - caller encrypts and enrolls into mh_pii

    Filters out deleted authors and known bots. Subreddit must exist and be public.
    """
    if sort not in ("new", "hot", "top", "rising"):
        raise ValueError(f"Unsupported sort: {sort}")

    try:
        sub = await reddit.subreddit(subreddit_name, fetch=True)
    except NotFound as e:
        raise SubredditUnavailable(f"r/{subreddit_name} does not exist") from e
    except Forbidden as e:
        raise SubredditUnavailable(f"r/{subreddit_name} is private/quarantined") from e

    items: list[dict] = []
    authors_map: dict[str, str] = {}

    listing_method = getattr(sub, sort)
    async for s in listing_method(limit=submissions_limit):
        if not _valid_author(s):
            continue
        author_name = s.author.name
        author_hash = hash_username(author_name)
        authors_map[author_hash] = author_name
        items.append(_normalize_submission(s, author_hash, include_all=False))

    if include_comments:
        try:
            async for c in sub.comments(limit=comments_limit):
                if not _valid_author(c):
                    continue
                author_name = c.author.name
                author_hash = hash_username(author_name)
                authors_map[author_hash] = author_name
                items.append(_normalize_comment(c, author_hash, include_all=False))
        except Forbidden as e:
            raise SubredditUnavailable(
                f"Cannot read comments for r/{subreddit_name}"
            ) from e

    return items, authors_map
