import json
import uuid
from pathlib import Path

import chromadb
from chromadb.utils import embedding_functions
from sentence_transformers import SentenceTransformer
from openai import OpenAI

from backend.config import settings

RESOURCES_PATH = Path(__file__).parent.parent.parent / "data" / "mental_health_resources.json"
CHROMA_PATH    = str(Path(__file__).parent.parent.parent / "chroma_db")
COLLECTION_NAME = "mental_health_resources"

_collection    = None
_openai_client: OpenAI = None
_embed_model: SentenceTransformer = None   # shared embedder for MongoDB path

BASE_SYSTEM_PROMPT = """You are a compassionate mental health support companion named Penumbra. \
Your role is to listen, reflect, and provide a safe space for the user to express their feelings. \
You are NOT a therapist and should never diagnose or prescribe.

GUIDELINES:
- Address the user by their feelings, not by clinical labels
- Acknowledge feelings FIRST before offering any suggestions
- Never advise ("you should do X") — instead ask questions or offer options
- Always end with a gentle suggestion to speak to a professional
- If you detect any crisis language, immediately refer to helplines and do not continue the normal response
- Keep responses warm, concise (3-4 sentences max), and non-judgmental
- Use the user profile below to personalise your response — show you understand their situation without being clinical"""


def _severity_to_theme(label: str) -> str:
    return {
        "Low":      "generally positive or stable emotional state",
        "Medium":   "mild to moderate stress or anxiety",
        "High":     "significant distress, likely depression or persistent low mood",
        "Critical": "severe distress or possible suicidal ideation — handle with extreme care",
    }.get(label, "unknown distress level")


def _build_system_prompt(user_context: dict | None, rag_chunks: list[str]) -> str:
    parts = [BASE_SYSTEM_PROMPT]

    if user_context:
        label  = user_context.get("severity_label", "Unknown")
        score  = int(user_context.get("severity_score", 0) * 100)
        posts  = user_context.get("recent_posts", [])
        theme  = _severity_to_theme(label)

        parts.append(f"""
USER PROFILE (from their Reddit post history — DO NOT share these details back verbatim):
- Current distress level: {label} ({score}%) — {theme}""")

        if posts:
            parts.append("- Recent post signals (most recent first):")
            for i, p in enumerate(posts[:5], 1):
                snippet = p.get("text_snippet", "")[:120].replace("\n", " ")
                sev     = p.get("severity", "")
                conf    = int(p.get("confidence", 0) * 100)
                parts.append(f"  [{i}] \"{snippet}\" → {sev} ({conf}% confidence)")

        parts.append(
            "\nUse this profile to make your response feel personal and contextually aware. "
            "If the distress level is Critical, prioritise safety and helpline referral above all else."
        )

    if rag_chunks:
        context_text = "\n\n---\n\n".join(rag_chunks)
        parts.append(f"\nRELEVANT MENTAL HEALTH RESOURCES (use these to inform your response, do not quote verbatim):\n{context_text}")

    return "\n".join(parts)


def initialize_rag():
    global _collection, _openai_client, _embed_model

    _openai_client = OpenAI(api_key=settings.OPENAI_API_KEY)
    _embed_model   = SentenceTransformer(settings.EMBEDDING_MODEL)

    # Always keep ChromaDB ready as fallback
    client = chromadb.PersistentClient(path=CHROMA_PATH)
    ef = embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name=settings.EMBEDDING_MODEL
    )
    _collection = client.get_or_create_collection(name=COLLECTION_NAME, embedding_function=ef)

    if _collection.count() == 0:
        with open(RESOURCES_PATH) as f:
            docs = json.load(f)
        _collection.add(
            ids=[d["id"] for d in docs],
            documents=[d["content"] for d in docs],
            metadatas=[{"title": d["title"], "category": d["category"]} for d in docs],
        )
        print(f"[RAG] ChromaDB indexed {len(docs)} mental health resources.")
    else:
        print(f"[RAG] ChromaDB collection ready ({_collection.count()} docs).")

    if settings.MONGODB_VECTOR_INDEX:
        print(f"[RAG] MongoDB vector index '{settings.MONGODB_VECTOR_INDEX}' configured — will use Atlas search.")
    else:
        print("[RAG] No MongoDB vector index configured — using ChromaDB for retrieval.")


async def _retrieve_chunks(message: str) -> tuple[list[str], list[str]]:
    """
    Returns (chunks, source_titles).
    Tries MongoDB Atlas $vectorSearch first; falls back to ChromaDB.
    """
    # ── MongoDB path (only if teammate's index is configured) ──────────────
    if settings.MONGODB_VECTOR_INDEX:
        try:
            from backend.services import mongo_service
            query_vec = _embed_model.encode(message).tolist()
            results = await mongo_service.vector_search(
                query_vector=query_vec,
                collection=settings.MONGODB_VECTOR_COLLECTION,
                index=settings.MONGODB_VECTOR_INDEX,
                field=settings.MONGODB_VECTOR_FIELD,
                n=3,
            )
            if results:
                chunks  = [r["content"] for r in results]
                sources = [r.get("title", "Resource") for r in results]
                print("[RAG] Retrieved via MongoDB Atlas vector search.")
                return chunks, sources
        except Exception as e:
            print(f"[RAG] MongoDB vector search failed ({e}), falling back to ChromaDB.")

    # ── ChromaDB fallback ───────────────────────────────────────────────────
    results  = _collection.query(query_texts=[message], n_results=3)
    chunks   = results["documents"][0]
    sources  = [m["title"] for m in results["metadatas"][0]]
    return chunks, sources


def chat_sync(message: str, history: list[dict], user_context: dict | None = None) -> dict:
    """Synchronous wrapper — used when called from a non-async context."""
    import asyncio
    loop = asyncio.new_event_loop()
    try:
        chunks, sources = loop.run_until_complete(_retrieve_chunks(message))
    finally:
        loop.close()
    return _call_openai(message, history, user_context, chunks, sources)


async def chat(message: str, history: list[dict], user_context: dict | None = None) -> dict:
    chunks, sources = await _retrieve_chunks(message)
    return _call_openai(message, history, user_context, chunks, sources)


def _call_openai(
    message: str,
    history: list[dict],
    user_context: dict | None,
    chunks: list[str],
    sources: list[str],
) -> dict:
    system = _build_system_prompt(user_context, chunks)

    messages = [{"role": "system", "content": system}]
    for turn in history:
        messages.append({"role": turn["role"], "content": turn["content"]})
    messages.append({"role": "user", "content": message})

    try:
        response = _openai_client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=messages,
            max_tokens=512,
            temperature=0.7,
        )
        reply = response.choices[0].message.content
    except Exception as e:
        print(f"[RAG] OpenAI error: {e}")
        reply = (
            "I'm here with you. It sounds like you're going through something difficult. "
            "Please consider reaching out to a professional — iCall is available at 9152987821."
        )

    return {
        "reply": reply,
        "sources": sources,
        "conversation_id": str(uuid.uuid4()),
    }
