"""Reddit OAuth2 (identity) login via asyncpraw. Requires a Reddit "web app" with REDDIT_REDIRECT_URI."""
import asyncpraw

from backend.config import settings


def is_configured() -> bool:
    return bool(settings.REDDIT_CLIENT_ID and settings.REDDIT_CLIENT_SECRET)


def _oauth_client() -> asyncpraw.Reddit:
    return asyncpraw.Reddit(
        client_id=settings.REDDIT_CLIENT_ID,
        client_secret=settings.REDDIT_CLIENT_SECRET,
        redirect_uri=settings.REDDIT_REDIRECT_URI,
        user_agent=settings.REDDIT_USER_AGENT,
    )


async def get_reddit_authorize_url(state: str) -> str:
    scopes = [s.strip() for s in settings.REDDIT_OAUTH_SCOPES.split(",") if s.strip()] or ["identity"]
    reddit = _oauth_client()
    try:
        return reddit.auth.url(scopes=scopes, state=state, duration="temporary")
    finally:
        await reddit.close()


async def get_reddit_user_id(code: str) -> str:
    reddit = _oauth_client()
    try:
        await reddit.auth.authorize(code)
        me = await reddit.user.me()
        if me is None:
            raise ValueError("Could not read Reddit identity from the access token.")
        return me.name
    finally:
        await reddit.close()
