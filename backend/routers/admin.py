from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from backend.config import settings
from backend.services import mongo_service

router = APIRouter(tags=["admin"])


# ── JWT helpers ────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    password: str


def _make_token() -> str:
    payload = {
        "sub": "admin",
        "exp": datetime.now(timezone.utc) + timedelta(hours=8),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def verify_admin(authorization: str = Header(...)):
    try:
        token = authorization.removeprefix("Bearer ").strip()
        jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Admin token expired. Please log in again.")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid admin token.")


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/admin/token")
async def admin_login(req: LoginRequest):
    if not settings.ADMIN_PASSWORD:
        raise HTTPException(status_code=503, detail="Admin password not configured on the server.")
    if req.password != settings.ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Incorrect password.")
    return {"token": _make_token()}


@router.get("/admin/users")
async def list_all_users(_: None = Depends(verify_admin)):
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
