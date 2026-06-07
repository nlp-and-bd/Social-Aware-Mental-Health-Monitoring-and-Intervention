import secrets
import time
import uuid
from urllib.parse import quote

from fastapi import APIRouter
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel

from backend.config import settings
from backend.routers.ingestion import run_ingest
from backend.services import auth_service, mongo_service, reddit_api

router = APIRouter(tags=["auth"])

_pending_states: dict[str, float] = {}
_STATE_TTL_SECONDS = 600


def _new_state() -> str:
    now = time.time()
    for s, ts in list(_pending_states.items()):
        if now - ts > _STATE_TTL_SECONDS:
            _pending_states.pop(s, None)
    state = secrets.token_urlsafe(24)
    _pending_states[state] = now
    return state


def _consume_state(state: str) -> bool:
    ts = _pending_states.pop(state, None)
    return ts is not None and (time.time() - ts) <= _STATE_TTL_SECONDS


async def _find_or_create_user(username: str, source: str) -> tuple[str, bool]:
    user = await mongo_service.find_user_by_username(username)
    if user:
        if source == "reddit" and user.get("source") != "reddit":
            await mongo_service.set_user_source(user["_id"], "reddit")
        return user["_id"], False
    user_id = "u" + uuid.uuid4().hex[:8]
    await mongo_service.upsert_user(user_id, username, [], [], source=source)
    return user_id, True


class MockLoginRequest(BaseModel):
    username: str


@router.post("/auth/mock-login")
async def mock_login(req: MockLoginRequest):
    """Username login + real app-only ingestion of the entered handle's public posts."""
    # Strip a single optional "u/" prefix only — lstrip() would eat leading 'u'/'/' chars.
    username = req.username.strip()
    username = username.removeprefix("u/").removeprefix("/u/").strip()
    if not username:
        return JSONResponse(status_code=400, content={"detail": "Username cannot be empty."})

    user_id, is_new = await _find_or_create_user(username, source="reddit")

    try:
        await run_ingest(user_id)
    except KeyError:
        if is_new:
            await mongo_service.delete_user(user_id)
        return JSONResponse(
            status_code=404,
            content={"detail": f"No Reddit user named '{username}' was found."},
        )
    except reddit_api.UserSuspended:
        if is_new:
            await mongo_service.delete_user(user_id)
        return JSONResponse(
            status_code=400,
            content={"detail": f"Reddit user '{username}' is suspended or private."},
        )
    except Exception as e:
        print(f"[AUTH] Ingestion failed for '{username}' (login still allowed): {e}")

    return {"user_id": user_id, "is_new": is_new}


@router.get("/auth/reddit")
async def reddit_login():
    if not auth_service.is_configured():
        return JSONResponse(
            status_code=501,
            content={"detail": "Reddit OAuth is not configured. Set REDDIT_CLIENT_ID / "
                               "REDDIT_CLIENT_SECRET, or use /auth/mock-login."},
        )
    state = _new_state()
    url = await auth_service.get_reddit_authorize_url(state)
    return RedirectResponse(url)


@router.get("/auth/callback")
async def reddit_callback(code: str = "", state: str = "", error: str = ""):
    login_url = f"{settings.FRONTEND_BASE_URL}/"

    if error:
        return RedirectResponse(f"{login_url}?error={quote(error)}")
    if not code or not _consume_state(state):
        return RedirectResponse(f"{login_url}?error=invalid_oauth_state")

    try:
        username = await auth_service.get_reddit_user_id(code)
    except Exception as e:
        print(f"[AUTH] Reddit OAuth exchange failed: {e}")
        return RedirectResponse(f"{login_url}?error=reddit_auth_failed")

    user_id, is_new = await _find_or_create_user(username, source="reddit")

    try:
        await run_ingest(user_id)
    except Exception as e:
        print(f"[AUTH] On-login ingestion failed for {username}: {e}")

    return RedirectResponse(
        f"{settings.FRONTEND_BASE_URL}/dashboard/{user_id}?is_new={int(is_new)}"
    )
