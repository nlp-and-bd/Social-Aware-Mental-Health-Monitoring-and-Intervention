from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    MONGODB_URI: str = "mongodb://localhost:27017"
    MONGODB_DB: str = "mental_health_db"
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"
    OPENAI_BASE_URL: str = ""
    FALLBACK_API_KEY: str = ""
    FALLBACK_BASE_URL: str = "https://api.groq.com/openai/v1"
    FALLBACK_MODEL: str = "meta-llama/llama-4-scout-17b-16e-instruct"
    MENTALBERT_MODEL_PATH: str = "./models/v2"
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
    REDDIT_CLIENT_ID: str = ""
    REDDIT_CLIENT_SECRET: str = ""
    REDDIT_USER_AGENT: str = "python:penumbra:1.0.0 (by /u/penumbra)"
    REDDIT_REDIRECT_URI: str = "http://localhost:8002/api/auth/callback"
    REDDIT_OAUTH_SCOPES: str = "identity"
    REDDIT_RECENT_WINDOW_DAYS: int = 90
    FRONTEND_BASE_URL: str = "http://localhost:3000"

    # Pinecone
    PINECONE_API_KEY: str = ""
    PINECONE_INDEX: str = "mhd"
    PINECONE_CLOUD: str = "aws"
    PINECONE_REGION: str = "us-east-1"

    # MongoDB Atlas Vector Search
    MONGODB_VECTOR_COLLECTION: str = "mental_health_resources"
    MONGODB_VECTOR_INDEX: str = ""
    MONGODB_VECTOR_FIELD: str = "embedding"

    # SMTP email (for emergency contact notifications)
    SMTP_ENABLED: bool = False
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "Penumbra <noreply@example.com>"

    # Public base URL used to build links in outgoing emails (e.g. the
    # emergency-contact consent-confirmation page served by the backend).
    PUBLIC_BASE_URL: str = "http://localhost:8002"

    # Admin JWT
    ADMIN_PASSWORD: str = "pokemon123"
    JWT_SECRET: str = "change-me-in-production"

    class Config:
        env_file = ".env"


settings = Settings()
