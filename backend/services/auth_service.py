"""
Reddit OAuth2 authentication — future implementation.

Flow (when activated):
1. GET /api/auth/reddit  → redirect user to Reddit's authorize URL
2. Reddit redirects to GET /api/auth/callback?code=XXX
3. Exchange code for access token via Reddit API
4. Call Reddit /api/v1/me to get username (used as user_id throughout the system)
5. Return user_id in a signed JWT cookie

Required .env vars (already slotted):
    REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_REDIRECT_URI
"""


def get_reddit_authorize_url() -> str:
    raise NotImplementedError("Reddit OAuth2 not yet implemented")


def get_reddit_user_id(code: str) -> str:
    """Exchange OAuth2 code for Reddit username."""
    raise NotImplementedError("Reddit OAuth2 not yet implemented")
