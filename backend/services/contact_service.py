"""
Emergency-contact reconciliation + double opt-in consent.

The user proposes a set of emergency contacts (in onboarding and in Settings).
Each contact may be marked as someone the user *wants* to be able to share
wellbeing details with. But details may only ever be sent to a contact who has
themselves confirmed — via a tokenised link emailed to them — that they agree
to receive them.

reconcile_contacts() merges the incoming list with what's already stored:
  - granted contacts stay granted (no re-confirmation needed)
  - already-pending contacts keep their existing token (no duplicate email)
  - newly-requested contacts get a fresh token + a consent-request email
  - contacts the user no longer wants details for fall back to "none"

The per-contact `consent_token` lives only in MongoDB; it is never surfaced in
an API response (the EmergencyContact schema doesn't declare it).
"""

import secrets

from backend.config import settings
from backend.services import mongo_service, email_service


def _confirm_url(token: str) -> str:
    base = settings.PUBLIC_BASE_URL.rstrip("/")
    return f"{base}/api/contacts/consent/confirm?token={token}"


async def reconcile_contacts(
    user_id: str, display_name: str | None, incoming: list[dict]
) -> list[dict]:
    """
    Persist the merged contact list and fire consent-request emails for any
    newly-requested details consent. Returns the merged list (tokens included,
    for internal use — the API layer rebuilds EmergencyContact which drops them).
    """
    stored = await mongo_service.get_emergency_contacts(user_id)
    stored_by_contact = {c.get("contact"): c for c in stored}

    merged: list[dict] = []
    to_email: list[tuple[str, str, str]] = []  # (name, contact, token)

    for c in incoming:
        name = (c.get("name") or "").strip()
        contact_val = (c.get("contact") or "").strip()
        if not name or not contact_val:
            continue

        notify = bool(c.get("notify", True))
        wants_details = bool(c.get("details_consent", False))
        prev = stored_by_contact.get(contact_val)

        status = "none"
        token = None

        # Details can only be confirmed over email, so only email contacts can
        # ever move beyond "none".
        if wants_details and "@" in contact_val:
            prev_status = prev.get("consent_status") if prev else None
            if prev_status == "granted":
                status = "granted"
            elif prev_status == "pending" and prev.get("consent_token"):
                status = "pending"
                token = prev.get("consent_token")
            else:
                status = "pending"
                token = secrets.token_urlsafe(24)
                to_email.append((name, contact_val, token))

        merged.append({
            "name": name,
            "contact": contact_val,
            "notify": notify,
            "details_consent": status == "granted",
            "consent_status": status,
            "consent_token": token,
            "email_type": "check_in",
            "custom_message": None,
        })

    await mongo_service.update_contacts(user_id, merged)

    user_name = display_name or "Someone who trusts you"
    for name, contact_val, token in to_email:
        await email_service.send_consent_request(name, contact_val, user_name, _confirm_url(token))

    return merged
