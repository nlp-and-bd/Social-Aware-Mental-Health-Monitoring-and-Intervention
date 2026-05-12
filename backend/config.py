from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    MONGODB_URI: str = "mongodb://localhost:27017"
    MONGODB_DB: str = "mental_health_db"
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"
    MENTALBERT_MODEL_PATH: str = "./models/v2"
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
    REDDIT_CLIENT_ID: str = ""
    REDDIT_CLIENT_SECRET: str = ""
    REDDIT_REDIRECT_URI: str = "http://localhost:8000/api/auth/callback"

    # MongoDB Atlas Vector Search — set these once teammate's index is merged
    # Leave MONGODB_VECTOR_INDEX empty to skip MongoDB search and use ChromaDB fallback
    MONGODB_VECTOR_COLLECTION: str = "mental_health_resources"
    MONGODB_VECTOR_INDEX: str = ""          # e.g. "vector_index"
    MONGODB_VECTOR_FIELD: str = "embedding"

    class Config:
        env_file = ".env"


settings = Settings()
