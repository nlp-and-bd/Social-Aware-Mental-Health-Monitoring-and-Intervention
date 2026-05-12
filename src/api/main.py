from contextlib import asynccontextmanager

from fastapi import FastAPI

from src.api.routes import router
from src.storage.indexes import ensure_pii_indexes, ensure_raw_indexes
from src.storage.mongo_client import close_client, get_pii_db, get_raw_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    await ensure_raw_indexes(get_raw_db())
    await ensure_pii_indexes(get_pii_db())
    yield
    await close_client()


app = FastAPI(
    title="MentalHealthBERT - Phase 1 Ingestion",
    version="1.0.0",
    description="Reddit -> MongoDB ingestion service. See docs/SCHEMA.md for the data contract.",
    lifespan=lifespan,
)

app.include_router(router)
