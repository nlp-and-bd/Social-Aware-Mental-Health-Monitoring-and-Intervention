from fastapi import APIRouter, HTTPException
from backend.models.schemas import (
    EvaluateRequest, EvaluateResponse, NotificationsResponse, Notification,
    NotifyPreviewRequest, NotifyPreviewResponse,
    SendNotificationRequest, SendNotificationResponse, NotificationResult,
)
from backend.services import response_service, mongo_service

router = APIRouter(tags=["response-engine"])


@router.post("/evaluate", response_model=EvaluateResponse)
async def evaluate(req: EvaluateRequest):
    try:
        result = await response_service.evaluate_and_respond(req.user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return EvaluateResponse(**result)


@router.post("/notify/preview", response_model=NotifyPreviewResponse)
async def notify_preview(req: NotifyPreviewRequest):
    try:
        result = await response_service.preview_notification(req.user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return NotifyPreviewResponse(**result)


@router.post("/notify/send", response_model=SendNotificationResponse)
async def notify_send(req: SendNotificationRequest):
    try:
        result = await response_service.send_notifications(
            req.user_id, req.email_type, [c.model_dump() for c in req.contacts],
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return SendNotificationResponse(
        user_id=result["user_id"],
        email_type=result["email_type"],
        sent=result["sent"],
        failed=result["failed"],
        skipped=result["skipped"],
        results=[NotificationResult(**r) for r in result["results"]],
    )


@router.get("/notify/{user_id}", response_model=NotificationsResponse)
async def get_notifications(user_id: str):
    notifications = await mongo_service.pop_notifications(user_id)
    return NotificationsResponse(
        user_id=user_id,
        notifications=[Notification(**n) for n in notifications],
    )
