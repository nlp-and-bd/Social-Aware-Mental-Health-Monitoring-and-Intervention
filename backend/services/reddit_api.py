"""
Real Reddit API integration — to be implemented by teammate.

Interface contract
------------------
Input:  user_id (str) — the Reddit username
Output: {
    "user_id": str,
    "posts": [
        {"date": "YYYY-MM-DD", "subreddit": str, "text": str},
        ...
    ]
}

Rules:
- date must be ISO format YYYY-MM-DD
- subreddit must be lowercase with no 'r/' prefix
- text is the raw post body, untruncated
- empty posts list is valid (user exists but has no posts)
- raise KeyError if user_id is not found on Reddit
"""


def get_posts_for_user(user_id: str) -> dict:
    raise NotImplementedError(
        "Real Reddit API not yet implemented. "
        "Swap this import in routers/ingestion.py when ready."
    )
