from fastapi import APIRouter, HTTPException
from backend.models.schemas import EvaluateRequest, EvaluateResponse, NotificationsResponse, Notification
from backend.services import response_service, mongo_service

router = APIRouter(tags=["response-engine"])


@router.post("/evaluate", response_model=EvaluateResponse)
async def evaluate(req: EvaluateRequest):
    try:
        result = await response_service.evaluate_and_respond(req.user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return EvaluateResponse(**result)


@router.get("/notify/{user_id}", response_model=NotificationsResponse)
async def get_notifications(user_id: str):
    notifications = await mongo_service.pop_notifications(user_id)
    return NotificationsResponse(
        user_id=user_id,
        notifications=[Notification(**n) for n in notifications],
    )
