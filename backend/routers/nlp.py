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
                severity=p["severity"],
                confidence=p["confidence"],
                timestamp=p["classified_at"],
            )
            for p in classified
        ]
        # Re-aggregate with recency weighting using existing classifications
        raw = [{"severity": p["severity"], "confidence": p["confidence"], "date": p.get("date", "")} for p in classified]
        agg_label, agg_score = nlp_service.aggregate_severity(raw)
        await mongo_service.update_severity(req.user_id, agg_label, agg_score)
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
