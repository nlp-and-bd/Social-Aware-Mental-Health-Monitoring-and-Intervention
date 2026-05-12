from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from config.settings import settings
from src.api.dependencies import get_repository, get_vault
from src.ingestion.cleaner import categorize_subreddit, is_relevant_subreddit
from src.ingestion.fetcher import (
    SubredditUnavailable,
    UserNotFound,
    UserSuspended,
    fetch_subreddit,
    fetch_user,
)
from src.ingestion.reddit_client import build_reddit_client
from src.ingestion.schema import (
    IngestRequest,
    IngestResponse,
    IngestStats,
    IngestSubredditRequest,
    IngestSubredditResponse,
    IngestSubredditStats,
    PostSummary,
)
from src.privacy.hashing import hash_username

router = APIRouter()


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@router.post("/ingest", response_model=IngestResponse)
async def ingest(
    req: IngestRequest,
    repo=Depends(get_repository),
    vault=Depends(get_vault),
) -> IngestResponse:
    username = req.user_id.strip()
    if not username:
        raise HTTPException(status_code=400, detail="user_id (Reddit username) required")

    user_id_hash = hash_username(username)
    fetched_at = datetime.now(timezone.utc)

    # Enroll user in PII vault if first time
    await repo.upsert_user_pii(user_id_hash, vault.encrypt(username))

    since_utc = (
        await repo.get_last_fetched_utc(user_id_hash) if req.incremental else None
    )

    reddit = build_reddit_client()
    errors: list[str] = []
    items: list[dict] = []
    api_remaining: float | None = None

    # Rate-limit guardrail: refuse to start a run when budget is exhausted
    pre_remaining = reddit.auth.limits.get("remaining")
    if pre_remaining is not None and pre_remaining < settings.rate_limit_floor:
        await reddit.close()
        raise HTTPException(
            status_code=503,
            detail=f"Reddit rate-limit budget too low ({pre_remaining}). Try again later.",
            headers={"Retry-After": "60"},
        )

    try:
        items = await fetch_user(
            reddit,
            username,
            submissions_limit=req.submissions_limit,
            comments_limit=req.comments_limit,
            since_utc=since_utc,
            include_all_subreddits=req.include_all_subreddits,
        )
        api_remaining = reddit.auth.limits.get("remaining")
    except UserNotFound as e:
        errors.append(str(e))
        raise HTTPException(status_code=404, detail=str(e))
    except UserSuspended as e:
        errors.append(str(e))
        raise HTTPException(status_code=403, detail=str(e))
    finally:
        await reddit.close()

    # Snapshot stats and the kept-items view BEFORE upsert mutates _skip_reason
    stats = IngestStats(
        submissions_fetched=sum(1 for i in items if i["type"] == "submission"),
        comments_fetched=sum(1 for i in items if i["type"] == "comment"),
        items_skipped_dedup=0,
        items_skipped_lang=sum(1 for i in items if i.get("_skip_reason") == "non_english"),
        items_skipped_short=sum(1 for i in items if i.get("_skip_reason") == "too_short"),
        items_skipped_deleted=sum(1 for i in items if i.get("_skip_reason") == "deleted"),
        items_skipped_irrelevant=sum(1 for i in items if i.get("_skip_reason") == "irrelevant_subreddit"),
        crisis_hits=sum(1 for i in items if i.get("crisis_keywords_hit")),
        api_remaining=api_remaining,
    )
    kept_items = [i for i in items if not i.get("_skip_reason")]

    upserted, skipped = await repo.upsert_posts(items)
    stats.items_upserted = upserted

    if items:
        latest_utc = max(i["created_utc"] for i in items)
        await repo.upsert_user(user_id_hash, latest_utc)

    await repo.write_audit({
        "audit_type": "user",
        "user_id_hash": user_id_hash,
        "fetched_at": fetched_at,
        "items_ingested": upserted,
        "items_skipped": skipped,
        "api_remaining": api_remaining,
        "errors": errors,
        "since_utc": since_utc,
    })

    posts_summary = [
        PostSummary(date=i["created_at"], subreddit=i["subreddit"], text=i["text"])
        for i in kept_items
    ]

    return IngestResponse(
        user_id=username,
        user_id_hash=user_id_hash,
        fetched_at=fetched_at,
        stats=stats,
        posts=posts_summary,
    )


@router.post("/ingest/subreddit", response_model=IngestSubredditResponse)
async def ingest_subreddit(
    req: IngestSubredditRequest,
    repo=Depends(get_repository),
    vault=Depends(get_vault),
) -> IngestSubredditResponse:
    sub_name = req.subreddit.strip().lstrip("r/").lstrip("/")
    if not sub_name:
        raise HTTPException(status_code=400, detail="subreddit required")
    if not is_relevant_subreddit(sub_name):
        raise HTTPException(
            status_code=400,
            detail=f"r/{sub_name} is not in the MH taxonomy. Add it to "
                   f"config/subreddit_taxonomy.yaml to allow ingestion.",
        )

    fetched_at = datetime.now(timezone.utc)
    reddit = build_reddit_client()
    api_remaining: float | None = None

    try:
        items, authors_map = await fetch_subreddit(
            reddit,
            sub_name,
            submissions_limit=req.submissions_limit,
            comments_limit=req.comments_limit,
            sort=req.sort,
            include_comments=req.include_comments,
        )
        api_remaining = reddit.auth.limits.get("remaining")
    except SubredditUnavailable as e:
        raise HTTPException(status_code=404, detail=str(e))
    finally:
        await reddit.close()

    encrypted_authors = [
        (h, vault.encrypt(name)) for h, name in authors_map.items()
    ]
    await repo.bulk_upsert_observed_users(encrypted_authors)
    await repo.bulk_touch_users(list(authors_map.keys()))

    # Snapshot stats BEFORE upsert mutates _skip_reason in-place
    stats_pre = {
        "submissions_fetched": sum(1 for i in items if i["type"] == "submission"),
        "comments_fetched": sum(1 for i in items if i["type"] == "comment"),
        "items_skipped_lang": sum(1 for i in items if i.get("_skip_reason") == "non_english"),
        "items_skipped_short": sum(1 for i in items if i.get("_skip_reason") == "too_short"),
        "items_skipped_deleted": sum(1 for i in items if i.get("_skip_reason") == "deleted"),
        "crisis_hits": sum(1 for i in items if i.get("crisis_keywords_hit")),
    }

    upserted, _skipped = await repo.upsert_posts(items)

    stats = IngestSubredditStats(
        unique_authors=len(authors_map),
        items_upserted=upserted,
        api_remaining=api_remaining,
        **stats_pre,
    )

    await repo.write_subreddit_audit({
        "subreddit": sub_name,
        "fetched_at": fetched_at,
        "items_fetched": len(items),
        "items_upserted": upserted,
        "unique_authors": len(authors_map),
        "api_remaining": api_remaining,
    })

    return IngestSubredditResponse(
        subreddit=sub_name,
        subreddit_category=categorize_subreddit(sub_name),
        fetched_at=fetched_at,
        stats=stats,
    )


@router.get("/users/{user_id_hash}/posts")
async def get_user_posts(
    user_id_hash: str,
    limit: int = 100,
    repo=Depends(get_repository),
) -> dict:
    if limit < 1 or limit > 1000:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 1000")
    docs = await repo.list_user_posts(user_id_hash, limit=limit)
    for d in docs:
        d.pop("text_raw", None)  # don't leak originals over HTTP
    return {"user_id_hash": user_id_hash, "count": len(docs), "posts": docs}


@router.delete("/users/{user_id_hash}", status_code=200)
async def delete_user(
    user_id_hash: str,
    repo=Depends(get_repository),
) -> dict:
    """Right-to-be-forgotten. Purges posts, user record, PII vault, and audit rows."""
    deleted = await repo.delete_user(user_id_hash)
    return {"user_id_hash": user_id_hash, "deleted": deleted}
