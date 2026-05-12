from fastapi import APIRouter, HTTPException
from backend.models.schemas import IngestRequest, IngestResponse, Post
from backend.services import reddit_mock as reddit_service  # swap to reddit_api when ready
from backend.services import mongo_service

router = APIRouter(tags=["ingestion"])


@router.post("/ingest", response_model=IngestResponse)
async def ingest(req: IngestRequest):
    try:
        result = reddit_service.get_posts_for_user(req.user_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"User '{req.user_id}' not found")

    meta = result.get("_meta", {})
    await mongo_service.upsert_user(
        user_id=req.user_id,
        username=meta.get("username", req.user_id),
        emergency_contacts=meta.get("emergency_contacts", []),
        connections=meta.get("connections", []),
    )

    for post in result["posts"]:
        post_id = f"{req.user_id}_{post['date']}_{post['subreddit']}"
        await mongo_service.upsert_post(
            post_id=post_id,
            user_id=req.user_id,
            date=post["date"],
            subreddit=post["subreddit"],
            text=post["text"],
        )

    return IngestResponse(
        user_id=result["user_id"],
        posts=[Post(**p) for p in result["posts"]],
    )
