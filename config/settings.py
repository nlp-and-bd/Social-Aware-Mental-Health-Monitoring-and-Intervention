from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # --- Reddit ---
    reddit_client_id: str
    reddit_client_secret: str
    reddit_user_agent: str

    # --- Mongo ---
    mongo_uri: str
    mongo_db_raw: str = "mh_raw"
    mongo_db_pii: str = "mh_pii"
    mongo_server_selection_timeout_ms: int = 5000

    # --- Privacy ---
    fernet_key: str = ""

    # --- Cleaner thresholds (tune for MH research) ---
    min_text_len: int = 10
    max_text_len: int = 10_000
    lang_confidence_min: float = 0.70

    # --- Lifecycle ---
    ingestion_version: str = "1.0.0"
    posts_retention_days: int = 365 * 2   # right-to-be-forgotten TTL

    # --- Operational guardrails ---
    rate_limit_floor: float = 100.0       # refuse new ingest runs below this api_remaining

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
