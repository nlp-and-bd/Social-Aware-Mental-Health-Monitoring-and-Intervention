from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.services import mongo_service
from backend.services.nlp_service import load_model
from backend.services.rag_service import initialize_rag
from backend.routers import auth, ingestion, graph, nlp, chatbot, response_engine, admin


@asynccontextmanager
async def lifespan(app: FastAPI):
    await mongo_service.connect()
    print("[DB] MongoDB connected.")
    load_model()
    initialize_rag()
    yield
    await mongo_service.close()
    print("[DB] MongoDB disconnected.")


app = FastAPI(title="Mental Health Monitor API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,            prefix="/api")
app.include_router(ingestion.router,       prefix="/api")
app.include_router(graph.router,           prefix="/api")
app.include_router(nlp.router,             prefix="/api")
app.include_router(chatbot.router,         prefix="/api")
app.include_router(response_engine.router, prefix="/api")
app.include_router(admin.router,           prefix="/api")


@app.get("/")
async def root():
    return {"status": "ok", "docs": "/docs"}
