from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter(tags=["auth"])


@router.get("/auth/reddit")
async def reddit_login():
    # Future: redirect to Reddit OAuth2 authorize URL
    return JSONResponse(
        status_code=501,
        content={"detail": "Reddit OAuth2 not yet implemented"},
    )


@router.get("/auth/callback")
async def reddit_callback(code: str = ""):
    # Future: exchange code for token, return JWT
    return JSONResponse(
        status_code=501,
        content={"detail": "Reddit OAuth2 not yet implemented"},
    )
