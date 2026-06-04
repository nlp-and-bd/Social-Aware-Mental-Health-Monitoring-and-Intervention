import uuid

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.services import mongo_service

router = APIRouter(tags=["auth"])


class MockLoginRequest(BaseModel):
    username: str


@router.post("/auth/mock-login")
async def mock_login(req: MockLoginRequest):
    """
    Simulated Reddit OAuth login — looks up user by username, creates one if new.
    Real Reddit OAuth wired in via /auth/reddit once credentials are ready.
    """
    # Strip a single optional "u/" prefix only — lstrip() would wrongly eat
    # any leading run of 'u'/'/' chars (e.g. "user_alpha" -> "ser_alpha").
    username = req.username.strip()
    username = username.removeprefix("u/").removeprefix("/u/").strip()
    if not username:
        return JSONResponse(status_code=400, content={"detail": "Username cannot be empty."})

    user = await mongo_service.find_user_by_username(username)
    if user:
        return {"user_id": user["_id"], "is_new": False}

    user_id = "u" + uuid.uuid4().hex[:8]
    await mongo_service.upsert_user(user_id, username, [], [])
    return {"user_id": user_id, "is_new": True}


@router.get("/auth/reddit")
async def reddit_login():
    return JSONResponse(
        status_code=501,
        content={"detail": "Reddit OAuth2 not yet implemented — use /auth/mock-login for now"},
    )


@router.get("/auth/callback")
async def reddit_callback(code: str = ""):
    return JSONResponse(
        status_code=501,
        content={"detail": "Reddit OAuth2 not yet implemented"},
    )
