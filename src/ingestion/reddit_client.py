import asyncpraw

from config.settings import settings


def build_reddit_client() -> asyncpraw.Reddit:
    """Read-only app-only OAuth client. No login, no write privileges."""
    return asyncpraw.Reddit(
        client_id=settings.reddit_client_id,
        client_secret=settings.reddit_client_secret,
        user_agent=settings.reddit_user_agent,
    )
