from fastapi import APIRouter
from backend.services import mongo_service

router = APIRouter(tags=["admin"])


@router.get("/admin/users")
async def list_all_users():
    users = await mongo_service.get_all_users()
    result = []
    for u in users:
        posts = await mongo_service.get_all_posts(u["_id"])
        classified = [p for p in posts if p.get("severity")]
        result.append({
            "user_id": u["_id"],
            "username": u.get("username", u["_id"]),
            "severity_label": u.get("severity_label", "Low"),
            "severity_score": round(u.get("severity_score", 0.0), 4),
            "post_count": len(posts),
            "classified_count": len(classified),
            "last_active": u.get("last_active"),
            "contacts_count": len(u.get("emergency_contacts", [])),
            "consent_given": u.get("consent_given", False),
        })

    counts: dict[str, int] = {"Low": 0, "Medium": 0, "High": 0, "Critical": 0}
    for r in result:
        label = r["severity_label"]
        counts[label] = counts.get(label, 0) + 1

    return {
        "users": result,
        "stats": {
            "total_users": len(result),
            "severity_distribution": counts,
            "critical_count": counts.get("Critical", 0),
            "high_count": counts.get("High", 0),
        },
    }
