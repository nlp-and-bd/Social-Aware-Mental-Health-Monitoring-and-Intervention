from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from backend.models.schemas import GraphDataResponse, GraphNode, GraphEdge, UserProfile, EmergencyContact, ConsentRequest
from backend.services import mongo_service, contact_service

router = APIRouter(tags=["graph"])


class UpdateContactsRequest(BaseModel):
    emergency_contacts: list[dict]
    display_name: Optional[str] = None


@router.get("/graph/data", response_model=GraphDataResponse)
async def graph_data(user_id: str):
    nodes_raw, edges_raw = await mongo_service.get_graph_data(user_id)
    if not nodes_raw:
        raise HTTPException(status_code=404, detail=f"User '{user_id}' not found")
    return GraphDataResponse(
        nodes=[GraphNode(**n) for n in nodes_raw],
        edges=[GraphEdge(**e) for e in edges_raw],
    )


@router.post("/graph/user/{user_id}/consent")
async def save_consent(user_id: str, req: ConsentRequest):
    await mongo_service.set_consent(user_id, req.username, req.display_name)
    # Reconcile contacts separately so double-opt-in tokens + consent emails fire.
    await contact_service.reconcile_contacts(
        user_id, req.display_name, [c.model_dump() for c in req.emergency_contacts]
    )
    return {"status": "ok"}


@router.put("/graph/user/{user_id}/contacts")
async def update_contacts(user_id: str, req: UpdateContactsRequest):
    user = await mongo_service.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{user_id}' not found")
    if req.display_name is not None:
        await mongo_service.set_display_name(user_id, req.display_name)
    display_name = req.display_name if req.display_name is not None else user.get("display_name")
    await contact_service.reconcile_contacts(user_id, display_name, req.emergency_contacts)
    return {"status": "ok"}


@router.delete("/graph/user/{user_id}/posts")
async def clear_posts(user_id: str):
    user = await mongo_service.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{user_id}' not found")
    await mongo_service.clear_user_posts(user_id)
    return {"status": "ok", "message": "Post history cleared"}


@router.delete("/graph/user/{user_id}")
async def delete_account(user_id: str):
    user = await mongo_service.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{user_id}' not found")
    await mongo_service.delete_user(user_id)
    return {"status": "ok", "message": "Account deleted"}


@router.get("/graph/user/{user_id}", response_model=UserProfile)
async def get_user(user_id: str):
    user = await mongo_service.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{user_id}' not found")
    posts = await mongo_service.get_all_posts(user_id)
    return UserProfile(
        user_id=user["_id"],
        username=user.get("username", user_id),
        display_name=user.get("display_name") or None,
        severity_score=user.get("severity_score", 0.0),
        severity_label=user.get("severity_label", "Low"),
        severity_history=user.get("severity_history", []),
        emergency_contacts=[EmergencyContact(**c) for c in user.get("emergency_contacts", [])],
        connections=user.get("connections", []),
        post_count=len(posts),
        consent_given=user.get("consent_given", False),
        last_active=user.get("last_active"),
    )
