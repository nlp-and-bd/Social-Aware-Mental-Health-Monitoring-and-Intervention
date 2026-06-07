from fastapi import APIRouter, HTTPException
from backend.models.schemas import IngestRequest, IngestResponse, Post
from backend.services import reddit_mock, reddit_api, rag_service
from backend.services import mongo_service

router = APIRouter(tags=["ingestion"])


async def run_ingest(user_id: str) -> dict:
    """Source-aware ingest (reddit_api for source='reddit', else reddit_mock). Reused by /ingest and OAuth callback."""
    user = await mongo_service.get_user(user_id)
    source = (user or {}).get("source", "mock")
    username = (user or {}).get("username")

    if source == "reddit" and username:
        result = await reddit_api.get_posts_for_user(username)
        is_reddit = True
    else:
        result = reddit_mock.get_posts_for_user(user_id)
        is_reddit = False

    meta = result.get("_meta", {})
    await mongo_service.upsert_user(
        user_id=user_id,
        username=meta.get("username", username or user_id),
        emergency_contacts=meta.get("emergency_contacts", []),
        connections=meta.get("connections", []),
        source=source,
    )

    for post in result["posts"]:
        if is_reddit:
            post_id = f"{user_id}_{post.get('fullname', post['date'] + '_' + post['subreddit'])}"
            embedding = rag_service.embed_text(post["text"])
            await mongo_service.upsert_post(
                post_id=post_id,
                user_id=user_id,
                date=post["date"],
                subreddit=post["subreddit"],
                text=post["text"],
                created_utc=post.get("created_utc"),
                embedding=embedding,
            )
        else:
            post_id = f"{user_id}_{post['date']}_{post['subreddit']}"
            await mongo_service.upsert_post(
                post_id=post_id,
                user_id=user_id,
                date=post["date"],
                subreddit=post["subreddit"],
                text=post["text"],
            )

    return result


@router.post("/ingest", response_model=IngestResponse)
async def ingest(req: IngestRequest):
    try:
        result = await run_ingest(req.user_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"User '{req.user_id}' not found")

    return IngestResponse(
        user_id=req.user_id,
        posts=[Post(date=p["date"], subreddit=p["subreddit"], text=p["text"]) for p in result["posts"]],
    )
