from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


PostType = Literal["submission", "comment"]
SubredditCategory = Literal[
    "mental_health", "support", "support_partner",
    "recovery", "trigger", "baseline", "general",
]
Phase3Status = Literal["pending", "scored", "failed"]


class RedditPost(BaseModel):
    id: str = Field(alias="_id")
    user_id_hash: str
    type: PostType
    subreddit: str
    subreddit_category: SubredditCategory = "general"

    title: str | None = None
    text: str
    text_raw: str

    created_utc: float
    created_at: datetime

    score: int = 0
    num_comments: int = 0
    permalink: str
    parent_id: str | None = None

    lang: str = "und"
    flair: str | None = None
    over_18: bool = False
    is_deleted: bool = False
    is_edited: bool = False

    ingested_at: datetime
    ingestion_version: str = "1.0.0"

    crisis_keywords_hit: list[str] = Field(default_factory=list)
    phase3_status: Phase3Status = Field(default="pending", alias="_phase3_status")

    model_config = {"populate_by_name": True}


class IngestRequest(BaseModel):
    user_id: str = Field(description="Reddit username of the user to ingest")
    submissions_limit: int | None = Field(
        default=200,
        ge=1,
        le=1000,
        description="Max submissions to fetch this run. Reddit caps at 1000 lifetime.",
    )
    comments_limit: int | None = Field(default=200, ge=1, le=1000)
    incremental: bool = Field(
        default=True,
        description="If true, skip items older than the user's last_fetched_utc.",
    )
    include_all_subreddits: bool = Field(
        default=False,
        description="If False (default), only posts from MH-relevant subreddits "
                    "(see config/subreddit_taxonomy.yaml) are stored. Set True to "
                    "ingest from ANY subreddit (e.g. for baseline/control studies).",
    )


class IngestStats(BaseModel):
    submissions_fetched: int = 0
    comments_fetched: int = 0
    items_skipped_dedup: int = 0
    items_skipped_lang: int = 0
    items_skipped_short: int = 0
    items_skipped_deleted: int = 0
    items_skipped_irrelevant: int = 0
    items_upserted: int = 0
    crisis_hits: int = 0
    api_remaining: float | None = None


class PostSummary(BaseModel):
    date: datetime
    subreddit: str
    text: str


class IngestResponse(BaseModel):
    user_id: str
    user_id_hash: str
    fetched_at: datetime
    stats: IngestStats
    posts: list[PostSummary]


class IngestSubredditRequest(BaseModel):
    subreddit: str = Field(description="Subreddit name without r/ prefix")
    submissions_limit: int = Field(default=100, ge=1, le=1000)
    comments_limit: int = Field(default=100, ge=1, le=1000)
    sort: Literal["new", "hot", "top", "rising"] = "new"
    include_comments: bool = True


class IngestSubredditStats(BaseModel):
    submissions_fetched: int = 0
    comments_fetched: int = 0
    unique_authors: int = 0
    items_skipped_lang: int = 0
    items_skipped_short: int = 0
    items_skipped_deleted: int = 0
    items_upserted: int = 0
    crisis_hits: int = 0
    api_remaining: float | None = None


class IngestSubredditResponse(BaseModel):
    subreddit: str
    subreddit_category: str
    fetched_at: datetime
    stats: IngestSubredditStats
