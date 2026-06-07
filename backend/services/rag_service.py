import json
import uuid
from pathlib import Path

import numpy as np
from openai import OpenAI
from pinecone import Pinecone, ServerlessSpec
from sentence_transformers import SentenceTransformer

from backend.config import settings

RESOURCES_PATH = Path(__file__).parent.parent.parent / "data" / "mental_health_resources.json"
PINECONE_NAMESPACE = ""
PINECONE_METRIC = "cosine"
PINECONE_BATCH_SIZE = 64

_pc: Pinecone | None = None
_pinecone_index = None
_openai_client: OpenAI = None
_fallback_client: OpenAI | None = None
_embed_model: SentenceTransformer = None

BASE_SYSTEM_PROMPT = """You are Penumbra, a warm, emotionally attuned mental-health support companion. \
You offer a calm, non-judgmental space where people feel genuinely heard. You are a peer-support \
companion — NOT a therapist, doctor, or crisis service — and you never diagnose, label, or prescribe.

SCOPE — stay on purpose:
- You ONLY discuss emotional wellbeing: feelings, stress, anxiety, low mood, loneliness, relationships, \
grief, self-care, coping, motivation, and finding support.
- If asked anything off-topic (coding, homework, maths, trivia, news, recipes, general how-tos, writing \
tasks), warmly decline in one or two sentences and steer back to how they're doing. Do NOT answer the \
off-topic request, even partially. Example: "I'm sorry, I'm really only here to support how you're feeling \
— but I'd genuinely like to know how you're doing right now."
- The ONLY exception is a safety concern (crisis language), which overrides everything else.

HOW TO RESPOND (evidence-informed, person-centred):
1. VALIDATE FIRST. Name and accept the specific feeling you hear ("that sounds exhausting", "it makes sense \
you'd feel this way"). Never rush past the emotion toward a solution.
2. REFLECT, don't fix. Mirror back what they seem to be going through so they feel understood. You are a \
listener, not an advice-giver.
3. STAY CURIOUS. Offer at most ONE gentle, open-ended question or a soft invitation. Don't interrogate with \
several questions at once.
4. EMPOWER, don't direct. Never say "you should" or "you need to". If you offer a coping idea, frame it as a \
gentle option they're free to leave ("some people find ___ helps — only if that feels right for you").
5. NORMALISE without minimising. It can help to say a feeling is common, but NEVER minimise it.

NEVER:
- Diagnose or name conditions ("you have depression/anxiety/BPD/bipolar").
- Give medical, medication, or treatment advice.
- Use toxic positivity, clichés, or platitudes ("at least…", "just stay positive", "everything happens for \
a reason", "be strong").
- Make promises ("it will definitely get better"), judge, lecture, or sound clinical or robotic.
- Recite the user's posts/data back to them verbatim.

TONE & FORMAT:
- Warm, human, plain language. Short — usually 2-4 sentences. No bullet points, headings, or lists in your reply.
- Match their energy: gentler, slower, and softer when distress is high.
- Encourage leaning on a trusted person or a mental-health professional when distress seems high or \
persistent — weave it in naturally and vary the wording; never tack it on as a scripted sign-off.

SAFETY (highest priority):
- If you notice ANY crisis signals (suicidal thoughts, self-harm, wanting to disappear, hopelessness about \
being alive), stop ordinary support immediately: express real care, take it seriously, and urge them to \
reach a crisis helpline or emergency services right now. Do not problem-solve or continue the normal chat.

Use the context below (distress level, recent posts, past conversation) to make your reply feel personal and \
continuous — attuning your tone to where they are — without ever reciting it back."""


def embed_text(text: str) -> list[float]:
    if _embed_model is None or not (text and text.strip()):
        return []
    return _embed_model.encode(text).tolist()


def rank_by_similarity(query_vec: list[float], items: list[dict], k: int = 3,
                       text_key: str = "text") -> list[dict]:
    """Top-k items by cosine similarity to query_vec (embeds items on the fly if needed)."""
    if not items or not query_vec:
        return []
    q = np.asarray(query_vec, dtype=float)
    qn = np.linalg.norm(q)
    if qn == 0:
        return []
    scored: list[tuple[float, dict]] = []
    for it in items:
        emb = it.get("embedding")
        if not emb:
            emb = embed_text(it.get(text_key) or "")
        if not emb:
            continue
        v = np.asarray(emb, dtype=float)
        vn = np.linalg.norm(v)
        if vn == 0:
            continue
        scored.append((float(np.dot(q, v) / (qn * vn)), it))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [it for _, it in scored[:k]]


# CAG: in-memory current-session cache (avoids a Mongo read per chat turn).
_session_cache: dict[str, list[dict]] = {}
_SESSION_CACHE_MAX_TURNS = 20
_SESSION_CACHE_MAX_SESSIONS = 500


def _evict_sessions() -> None:
    overflow = len(_session_cache) - _SESSION_CACHE_MAX_SESSIONS
    if overflow > 0:
        for cid in list(_session_cache.keys())[:overflow]:
            _session_cache.pop(cid, None)


def cache_get(conversation_id: str) -> list[dict] | None:
    return _session_cache.get(conversation_id)


def cache_seed(conversation_id: str, turns: list[dict]) -> None:
    _session_cache[conversation_id] = [
        {"role": t["role"], "content": t["content"]} for t in turns
    ][-_SESSION_CACHE_MAX_TURNS:]
    _evict_sessions()


def cache_append(conversation_id: str, role: str, content: str) -> None:
    sess = _session_cache.setdefault(conversation_id, [])
    sess.append({"role": role, "content": content})
    if len(sess) > _SESSION_CACHE_MAX_TURNS:
        del sess[:-_SESSION_CACHE_MAX_TURNS]
    _evict_sessions()


def _severity_to_theme(label: str) -> str:
    return {
        "Low":      "generally positive or stable emotional state",
        "Medium":   "mild to moderate stress or anxiety",
        "High":     "significant distress, likely depression or persistent low mood",
        "Critical": "severe distress or possible suicidal ideation — handle with extreme care",
    }.get(label, "unknown distress level")


def _embedding_dimension() -> int:
    sample = _embed_model.encode("dimension probe")
    return len(sample)


def _pinecone_vector_count(stats: dict) -> int:
    namespaces = stats.get("namespaces") or {}
    total = 0
    for ns in namespaces.values():
        total += ns.get("vector_count", 0)
    return total


def _build_system_prompt(user_context: dict | None, rag_chunks: list[str],
                         personal_chunks: list[str] | None = None,
                         past_turns: list[dict] | None = None) -> str:
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
            "\nAttune your tone to this distress level:"
            "\n- Low: light, encouraging, affirm what's going well."
            "\n- Medium: validate the stress, gently explore what's weighing on them."
            "\n- High: slow down, be especially warm and patient, sit with the heaviness, gently encourage "
            "professional support."
            "\n- Critical: prioritise safety and a crisis helpline above all else — care and referral first, "
            "no ordinary problem-solving."
        )

    if personal_chunks:
        joined = "\n".join(f'  - "{c[:200].strip()}"' for c in personal_chunks if c and c.strip())
        if joined:
            parts.append(
                "\nUSER'S OWN RECENT REDDIT POSTS (semantically relevant to their current "
                "message — context only, do NOT quote these back verbatim):\n" + joined
            )

    if past_turns:
        convo = "\n".join(
            f"  {t['role']}: {t['content'][:200]}" for t in past_turns if t.get("content")
        )
        if convo:
            parts.append(
                "\nRELEVANT PAST CONVERSATION (things they shared with you earlier — use for "
                "continuity, do NOT repeat verbatim):\n" + convo
            )

    if rag_chunks:
        context_text = "\n\n---\n\n".join(rag_chunks)
        parts.append(f"\nRELEVANT MENTAL HEALTH RESOURCES (use these to inform your response, do not quote verbatim):\n{context_text}")

    return "\n".join(parts)


def initialize_rag():
    global _pc, _pinecone_index, _openai_client, _fallback_client, _embed_model

    _openai_client = OpenAI(
        api_key=settings.OPENAI_API_KEY,
        base_url=settings.OPENAI_BASE_URL or None,
    )
    if settings.OPENAI_BASE_URL:
        print(f"[RAG] Using OpenAI-compatible endpoint: {settings.OPENAI_BASE_URL} (model {settings.OPENAI_MODEL})")

    if settings.FALLBACK_API_KEY and settings.FALLBACK_BASE_URL:
        _fallback_client = OpenAI(
            api_key=settings.FALLBACK_API_KEY,
            base_url=settings.FALLBACK_BASE_URL,
        )
        print(f"[RAG] Fallback LLM ready: {settings.FALLBACK_BASE_URL} (model {settings.FALLBACK_MODEL})")
    else:
        _fallback_client = None
        print("[RAG] No fallback LLM configured (set FALLBACK_API_KEY + FALLBACK_BASE_URL to enable).")
    _embed_model   = SentenceTransformer(settings.EMBEDDING_MODEL)

    if settings.PINECONE_API_KEY and settings.PINECONE_INDEX:
        _pc = Pinecone(api_key=settings.PINECONE_API_KEY)
        index_name = settings.PINECONE_INDEX

        if index_name not in _pc.list_indexes().names():
            dimension = _embedding_dimension()
            _pc.create_index(
                name=index_name,
                dimension=dimension,
                metric=PINECONE_METRIC,
                spec=ServerlessSpec(
                    cloud=settings.PINECONE_CLOUD,
                    region=settings.PINECONE_REGION,
                ),
            )
            print(f"[RAG] Pinecone index '{index_name}' created ({dimension} dims).")

        _pinecone_index = _pc.Index(index_name)
        stats = _pinecone_index.describe_index_stats()
        vector_count = _pinecone_vector_count(stats)

        if vector_count == 0:
            with open(RESOURCES_PATH) as f:
                docs = json.load(f)
            embeddings = _embed_model.encode([d["content"] for d in docs]).tolist()
            vectors = []
            for doc, vector in zip(docs, embeddings):
                vectors.append(
                    {
                        "id": doc["id"],
                        "values": vector,
                        "metadata": {
                            "title": doc["title"],
                            "category": doc["category"],
                            "content": doc["content"],
                        },
                    }
                )
            for i in range(0, len(vectors), PINECONE_BATCH_SIZE):
                _pinecone_index.upsert(
                    vectors=vectors[i : i + PINECONE_BATCH_SIZE],
                    namespace=PINECONE_NAMESPACE,
                )
            print(f"[RAG] Pinecone indexed {len(docs)} mental health resources.")
        else:
            print(f"[RAG] Pinecone index ready ({vector_count} vectors).")
    else:
        print("[RAG] Pinecone not configured. Set PINECONE_API_KEY and PINECONE_INDEX to enable retrieval.")

    if settings.MONGODB_VECTOR_INDEX:
        print(f"[RAG] MongoDB vector index '{settings.MONGODB_VECTOR_INDEX}' configured — will use Atlas search.")
    elif _pinecone_index is not None:
        print("[RAG] No MongoDB vector index configured — using Pinecone for retrieval.")
    else:
        print("[RAG] No MongoDB vector index configured and Pinecone is not ready — retrieval disabled.")


async def _retrieve_chunks(message: str) -> tuple[list[str], list[str]]:
    """
    Returns (chunks, source_titles).
    Tries MongoDB Atlas $vectorSearch first; falls back to Pinecone.
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
            print(f"[RAG] MongoDB vector search failed ({e}), falling back to Pinecone.")

    # ── Pinecone fallback ───────────────────────────────────────────────────
    if _pinecone_index is None:
        return [], []

    try:
        query_vec = _embed_model.encode(message).tolist()
        results = _pinecone_index.query(
            vector=query_vec,
            top_k=3,
            include_metadata=True,
            namespace=PINECONE_NAMESPACE,
        )
        matches = results.get("matches", [])
        chunks = []
        sources = []
        for match in matches:
            metadata = match.get("metadata") or {}
            content = metadata.get("content")
            if content:
                chunks.append(content)
                sources.append(metadata.get("title", "Resource"))
        return chunks, sources
    except Exception as e:
        print(f"[RAG] Pinecone query failed ({e}).")
        return [], []


def chat_sync(message: str, history: list[dict], user_context: dict | None = None,
              personal_chunks: list[str] | None = None,
              past_turns: list[dict] | None = None) -> dict:
    """Synchronous wrapper — used when called from a non-async context."""
    import asyncio
    loop = asyncio.new_event_loop()
    try:
        chunks, sources = loop.run_until_complete(_retrieve_chunks(message))
    finally:
        loop.close()
    return _call_openai(message, history, user_context, chunks, sources, personal_chunks, past_turns)


async def chat(message: str, history: list[dict], user_context: dict | None = None,
               personal_chunks: list[str] | None = None,
               past_turns: list[dict] | None = None) -> dict:
    chunks, sources = await _retrieve_chunks(message)
    return _call_openai(message, history, user_context, chunks, sources, personal_chunks, past_turns)


def _call_openai(
    message: str,
    history: list[dict],
    user_context: dict | None,
    chunks: list[str],
    sources: list[str],
    personal_chunks: list[str] | None = None,
    past_turns: list[dict] | None = None,
) -> dict:
    system = _build_system_prompt(user_context, chunks, personal_chunks, past_turns)

    messages = [{"role": "system", "content": system}]
    for turn in history:
        messages.append({"role": turn["role"], "content": turn["content"]})
    messages.append({"role": "user", "content": message})

    reply = None
    try:
        reply = _complete(_openai_client, settings.OPENAI_MODEL, messages)
    except Exception as e:
        print(f"[RAG] OpenAI error: {e}")
        if _fallback_client is not None:
            try:
                reply = _complete(_fallback_client, settings.FALLBACK_MODEL, messages)
                print("[RAG] Served via fallback LLM.")
            except Exception as e2:
                print(f"[RAG] Fallback LLM error: {e2}")

    if reply is None:
        reply = (
            "I'm really glad you reached out, and I'm here with you — it sounds like things feel heavy "
            "right now. I'm having a little trouble responding fully this moment, but you don't have to "
            "carry this alone. If it would help to talk to someone, iCall counsellors are there at 9152987821."
        )

    return {
        "reply": reply,
        "sources": sources,
        "conversation_id": str(uuid.uuid4()),
    }


def _complete(client: OpenAI, model: str, messages: list[dict]) -> str:
    response = client.chat.completions.create(
        model=model,
        messages=messages,
        max_tokens=512,
        temperature=0.6,
        presence_penalty=0.3,
    )
    return response.choices[0].message.content
