import uuid
from fastapi import APIRouter, HTTPException
from backend.models.schemas import ChatRequest, ChatResponse
from backend.services import mongo_service, rag_service, nlp_service
from pydantic import BaseModel

class ChatHistoryResponse(BaseModel):
    user_id: str
    history: list[dict]

router = APIRouter(tags=["chatbot"])

CRISIS_REPLY = (
    "I can hear that you're in a lot of pain right now, and I'm glad you reached out. "
    "Please contact a crisis helpline immediately — you don't have to face this alone.\n\n"
    "📞 **iCall (TISS):** 9152987821\n"
    "📞 **Vandrevala Foundation:** 1860-2662-345\n"
    "💬 **iCall chat:** icallhelpline.org\n\n"
    "If you are in immediate danger, please call emergency services."
)


async def _build_user_context(user_id: str, user: dict) -> dict:
    posts = await mongo_service.get_all_posts(user_id)
    classified = [p for p in posts if p.get("severity")]
    classified.sort(key=lambda p: p.get("classified_at") or "", reverse=True)
    recent = classified[:5]

    return {
        "severity_label": user.get("severity_label", "Low"),
        "severity_score": user.get("severity_score", 0.0),
        "recent_posts": [
            {
                "text_snippet": p.get("text", "")[:200],
                "severity":     p.get("severity", ""),
                "confidence":   p.get("confidence", 0.0),
                "date":         p.get("date", ""),
            }
            for p in recent
        ],
    }


_HISTORY_SCAN_CAP = 200


async def _build_personal_context(user_id: str, user: dict, message: str,
                                  conv_id: str) -> tuple[list[str], list[dict]]:
    """Semantic RAG over the user's own 90-day posts + relevant prior-session chat turns."""
    query_vec = rag_service.embed_text(message)
    if not query_vec:
        return [], []

    recent_posts = await mongo_service.get_recent_posts(user_id, days=90)
    top_posts = rag_service.rank_by_similarity(query_vec, recent_posts, k=3, text_key="text")
    personal_chunks = [p["text"] for p in top_posts if p.get("text")]

    history = (user.get("chat_history") or [])[-_HISTORY_SCAN_CAP:]
    candidates = []
    for idx, turn in enumerate(history):
        if turn.get("role") == "user" and turn.get("conversation_id") != conv_id and turn.get("content"):
            candidates.append({**turn, "_idx": idx})
    past_turns: list[dict] = []
    for hit in rag_service.rank_by_similarity(query_vec, candidates, k=3, text_key="content"):
        i = hit["_idx"]
        past_turns.append({"role": "user", "content": hit["content"]})
        if i + 1 < len(history) and history[i + 1].get("role") == "assistant":
            past_turns.append({"role": "assistant", "content": history[i + 1]["content"]})

    return personal_chunks, past_turns


@router.get("/chat/history/{user_id}", response_model=ChatHistoryResponse)
async def get_history(user_id: str):
    user = await mongo_service.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{user_id}' not found.")
    history = user.get("chat_history", [])
    return ChatHistoryResponse(user_id=user_id, history=history)


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    user = await mongo_service.get_user(req.user_id)
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{req.user_id}' not found. Run /ingest first.")

    conv_id = req.conversation_id or str(uuid.uuid4())

    # Crisis keyword fast-path — no LLM needed
    if nlp_service.crisis_keyword_check(req.message):
        await mongo_service.append_chat_turn(req.user_id, "user", req.message, conv_id)
        await mongo_service.append_chat_turn(req.user_id, "assistant", CRISIS_REPLY, conv_id)
        await mongo_service.update_severity(req.user_id, "Critical", 1.0)
        return ChatResponse(
            reply=CRISIS_REPLY,
            conversation_id=conv_id,
            sources=[],
            crisis_detected=True,
        )

    user_context = await _build_user_context(req.user_id, user)

    # CAG: serve this session from the in-memory cache, seeding from MongoDB on a miss.
    session_history = rag_service.cache_get(conv_id)
    if session_history is None:
        seed = await mongo_service.get_session_history(req.user_id, conv_id, last_n=6)
        rag_service.cache_seed(conv_id, seed)
        session_history = rag_service.cache_get(conv_id) or []

    personal_chunks, past_turns = await _build_personal_context(
        req.user_id, user, req.message, conv_id
    )

    result = await rag_service.chat(
        req.message, session_history, user_context,
        personal_chunks=personal_chunks, past_turns=past_turns,
    )

    await mongo_service.append_chat_turn(req.user_id, "user", req.message, conv_id)
    await mongo_service.append_chat_turn(req.user_id, "assistant", result["reply"], conv_id)
    rag_service.cache_append(conv_id, "user", req.message)
    rag_service.cache_append(conv_id, "assistant", result["reply"])

    return ChatResponse(
        reply=result["reply"],
        conversation_id=conv_id,
        sources=result["sources"],
        crisis_detected=False,
    )
