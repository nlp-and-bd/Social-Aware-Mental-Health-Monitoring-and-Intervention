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
    """Fetch the user's severity label + last 5 classified posts for RAG context."""
    posts = await mongo_service.get_all_posts(user_id)
    classified = [p for p in posts if p.get("severity")]
    # Sort by classified_at descending, take 5 most recent
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

    # Build user context (severity class + recent posts) for the RAG prompt
    user_context = await _build_user_context(req.user_id, user)

    # Only pass turns from THIS session as LLM context — never bleed old sessions
    session_history = await mongo_service.get_session_history(req.user_id, conv_id, last_n=6)

    result = await rag_service.chat(req.message, session_history, user_context)

    await mongo_service.append_chat_turn(req.user_id, "user", req.message, conv_id)
    await mongo_service.append_chat_turn(req.user_id, "assistant", result["reply"], conv_id)

    return ChatResponse(
        reply=result["reply"],
        conversation_id=conv_id,
        sources=result["sources"],
        crisis_detected=False,
    )
