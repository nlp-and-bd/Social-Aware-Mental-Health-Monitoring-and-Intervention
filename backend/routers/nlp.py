from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from backend.models.schemas import ClassifyRequest, ClassifyResponse, PostSeverityResult
from backend.services import mongo_service
from backend.services import nlp_service

router = APIRouter(tags=["nlp"])


@router.post("/classify", response_model=ClassifyResponse)
async def classify(req: ClassifyRequest):
    user = await mongo_service.get_user(req.user_id)
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{req.user_id}' not found. Run /ingest first.")

    posts = await mongo_service.get_unclassified_posts(req.user_id)
    if not posts:
        # All posts already classified — return existing aggregate
        all_posts = await mongo_service.get_all_posts(req.user_id)
        classified = [p for p in all_posts if p.get("severity")]
        results = [
            PostSeverityResult(
                post_id=p["_id"],
                text_snippet=p["text"][:120],
                text=p.get("text", ""),
                subreddit=p.get("subreddit", ""),
                date=p.get("date", ""),
                severity=p["severity"],
                confidence=p["confidence"],
                timestamp=p["classified_at"],
            )
            for p in classified
        ]
        # Re-aggregate with recency weighting using existing classifications.
        # Do NOT call update_severity here — no new posts were classified,
        # so writing to severity_history would add a spurious data point on every login.
        raw = [{"severity": p["severity"], "confidence": p["confidence"], "date": p.get("date", "")} for p in classified]
        agg_label, agg_score = nlp_service.aggregate_severity(raw)
        return ClassifyResponse(
            user_id=req.user_id,
            results=results,
            aggregate_severity=agg_label,
            severity_score=agg_score,
        )

    results = []
    raw_results = []

    for post in posts:
        now = datetime.now(timezone.utc).isoformat()

        if nlp_service.crisis_keyword_check(post["text"]):
            severity, confidence = "Critical", 1.0
        else:
            out = nlp_service.classify_text(post["text"])
            severity, confidence = out["severity"], out["confidence"]

        await mongo_service.update_post_severity(post["_id"], severity, confidence)
        raw_results.append({"severity": severity, "confidence": confidence, "date": post.get("date", "")})
        results.append(PostSeverityResult(
            post_id=post["_id"],
            text_snippet=post["text"][:120],
            text=post.get("text", ""),
            subreddit=post.get("subreddit", ""),
            date=post.get("date", ""),
            severity=severity,
            confidence=confidence,
            timestamp=now,
        ))

    agg_label, agg_score = nlp_service.aggregate_severity(raw_results)
    await mongo_service.update_severity(req.user_id, agg_label, agg_score)

    return ClassifyResponse(
        user_id=req.user_id,
        results=results,
        aggregate_severity=agg_label,
        severity_score=agg_score,
    )


@router.get("/classify/{user_id}", response_model=ClassifyResponse)
async def get_classified(user_id: str):
    """
    Read-only: return a user's already-classified posts without running the model
    or writing anything (no severity_history mutation). Used by the admin view so
    inspecting a profile never alters that user's data.
    """
    user = await mongo_service.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{user_id}' not found.")

    all_posts = await mongo_service.get_all_posts(user_id)
    classified = [p for p in all_posts if p.get("severity")]
    results = [
        PostSeverityResult(
            post_id=p["_id"],
            text_snippet=p["text"][:120],
            text=p.get("text", ""),
            subreddit=p.get("subreddit", ""),
            date=p.get("date", ""),
            severity=p["severity"],
            confidence=p["confidence"],
            timestamp=p.get("classified_at", ""),
        )
        for p in classified
    ]

    raw = [{"severity": p["severity"], "confidence": p["confidence"], "date": p.get("date", "")} for p in classified]
    if raw:
        agg_label, agg_score = nlp_service.aggregate_severity(raw)
    else:
        agg_label = user.get("severity_label", "Low")
        agg_score = user.get("severity_score", 0.0)

    return ClassifyResponse(
        user_id=user_id,
        results=results,
        aggregate_severity=agg_label,
        severity_score=agg_score,
    )
