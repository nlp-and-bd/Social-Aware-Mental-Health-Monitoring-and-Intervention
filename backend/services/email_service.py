"""
Emergency-contact mailing.

This module owns everything to do with *sending* a message to a user's chosen
emergency contacts: SMTP transport, the three email templates, and the
AI-generated "state summary" used by the detailed template.

It deliberately knows nothing about severity scoring, trends or helplines —
that lives in response_service. response_service decides *whether* to offer
notification; this module decides *how* a chosen message is rendered and sent.

Privacy model:
  - "check_in"     → generic. No personal data, no severity, no post content.
  - "with_details" → includes a soft, non-clinical summary of what the user may
                     be going through (generated from recent posts). Only sent to
                     contacts the user has marked as details_consent = True.
  - "custom"       → the user's own words, passed through verbatim. Also gated on
                     details_consent.
"""

import asyncio
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from backend.config import settings

SUBJECT = "Someone who trusts you wanted to reach out"

CONSENT_SUBJECT = "Someone added you as a person they trust — a quick confirmation"

_GENERIC_SUMMARY = (
    "they've been having a hard time lately and could use a little extra care"
)


def render_consent_request(contact_name: str, user_name: str, confirm_url: str) -> str:
    """
    Double opt-in email asking a contact to confirm they're willing to receive
    wellbeing details about the user. Until they confirm, they get nothing beyond,
    at most, a generic check-in. The user's Reddit handle is never mentioned.
    """
    return (
        f"Hi {contact_name},\n\n"
        f"{user_name} has chosen you as someone they trust on Penumbra, a gentle "
        f"mental-wellbeing companion.\n\n"
        f"They'd like your permission to share a little about how they're doing — "
        f"but only if you're comfortable receiving it. If you're happy to be there "
        f"for them, please confirm here:\n\n"
        f"    {confirm_url}\n\n"
        f"Until you confirm, you won't receive any personal details — only, at most, "
        f"a simple note that they reached out. If you'd rather not, you can simply "
        f"ignore this email and nothing more will be sent.\n\n"
        f"Thank you for being someone they can lean on.\n\n"
        f"— Penumbra"
    )


async def send_consent_request(
    name: str, contact: str, user_name: str, confirm_url: str
) -> dict:
    """Send a single consent-request email. Returns an audit dict (never raises)."""
    base = {"name": name, "contact": contact}
    if "@" not in (contact or ""):
        return {**base, "status": "skipped", "reason": "not an email address"}

    if not settings.SMTP_ENABLED or not settings.SMTP_USER:
        print(f"[EMAIL] SMTP disabled — would send consent request to {name} <{contact}>")
        print(f"[EMAIL]   confirm link: {confirm_url}")
        return {**base, "status": "simulated", "reason": None}

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = CONSENT_SUBJECT
        msg["From"] = settings.SMTP_FROM
        msg["To"] = contact
        msg.attach(MIMEText(render_consent_request(name, user_name, confirm_url), "plain"))
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, _smtp_send, contact, msg)
        print(f"[EMAIL] Sent consent request to {name} <{contact}>")
        return {**base, "status": "sent", "reason": None}
    except Exception as e:
        print(f"[EMAIL] Consent request failed for {name} <{contact}>: {e}")
        return {**base, "status": "failed", "reason": str(e)}


def render_body(
    contact_name: str,
    user_display: str,
    email_type: str,
    summary: str,
    custom_message: str | None,
) -> str:
    """Plain-text email body for the given template type."""
    if email_type == "with_details":
        return (
            f"Hi {contact_name},\n\n"
            f"{user_display} is going through a difficult period right now and wanted "
            f"you to be aware. Here is a gentle, non-clinical picture of how they may "
            f"be feeling, so you know how to show up for them:\n\n"
            f"    {summary}\n\n"
            f"This is not a diagnosis — just a sense of what they're carrying. "
            f"You don't need to have the answers. Reaching out, listening, or simply "
            f"being present can help more than you might realise.\n\n"
            f"If you are ever worried for their immediate safety, please encourage "
            f"them to call 112 or a mental-health helpline.\n\n"
            f"— Penumbra\n"
            f"(Shared with {user_display}'s explicit consent.)"
        )
    if email_type == "custom" and custom_message:
        return (
            f"Hi {contact_name},\n\n"
            f"{user_display} asked us to pass a message along to you:\n\n"
            f"    “{custom_message.strip()}”\n\n"
            f"A kind reply or a quick call would mean a lot to them right now.\n\n"
            f"— Penumbra\n"
            f"(Sent on their behalf, with their consent.)"
        )
    # default: check_in — no personal data of any kind
    return (
        f"Hi {contact_name},\n\n"
        f"{user_display} may be having a difficult time and chose to reach out to you. "
        f"You don't need to have answers — a kind message or a quick call can make a "
        f"real difference.\n\n"
        f"Just being present helps.\n\n"
        f"— Penumbra\n"
        f"(Sent with their consent. Contains no personal details or diagnoses.)"
    )


def _build_email(
    contact_name: str,
    user_display: str,
    email_type: str,
    summary: str,
    custom_message: str | None,
) -> MIMEMultipart:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = SUBJECT
    msg["From"] = settings.SMTP_FROM
    msg.attach(MIMEText(render_body(contact_name, user_display, email_type, summary, custom_message), "plain"))
    return msg


def _smtp_send(contact_email: str, msg: MIMEMultipart) -> None:
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
        server.ehlo()
        server.starttls()
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.sendmail(settings.SMTP_FROM, contact_email, msg.as_string())


async def generate_state_summary(user_context: dict) -> str:
    """
    A short, warm, non-clinical sentence describing what the user may be going
    through, built from their recent posts. Used by the with_details template.
    Falls back to a generic line on any error.
    """
    try:
        from backend.services import rag_service
        posts = user_context.get("recent_posts", [])
        snippets = "\n".join(
            f"- \"{p['text_snippet'][:140]}\" ({p['severity']})"
            for p in posts[:4]
        )
        prompt = (
            "A person has chosen to let someone they trust know they are struggling. "
            "Based on their recent posts below, write ONE warm, gentle, non-clinical "
            "sentence (max 35 words) describing what they may be going through, written "
            "in the third person (e.g. 'they have been feeling...'). "
            "Do NOT diagnose, do NOT name conditions, do NOT quote the posts. "
            f"Recent posts:\n{snippets}\n\n"
            "Return only the single sentence, no preamble."
        )
        result = await rag_service.chat(prompt, [], user_context)
        line = (result.get("reply") or "").strip().split("\n")[0].strip().strip('"')
        if 10 <= len(line) <= 320:
            return line
    except Exception as e:
        print(f"[EMAIL] state summary generation failed: {e}")
    return _GENERIC_SUMMARY


async def send_one(
    name: str,
    contact: str,
    user_display: str,
    email_type: str,
    summary: str,
    custom_message: str | None,
) -> dict:
    """Send to a single contact. Returns an audit result dict (never raises)."""
    base = {"name": name, "contact": contact}

    if "@" not in (contact or ""):
        return {**base, "status": "skipped", "reason": "not an email address"}
    if email_type == "custom" and not (custom_message or "").strip():
        return {**base, "status": "skipped", "reason": "no message written"}

    if not settings.SMTP_ENABLED or not settings.SMTP_USER:
        print(f"[EMAIL] SMTP disabled — would send '{email_type}' to {name} <{contact}>")
        return {**base, "status": "simulated", "reason": None}

    try:
        msg = _build_email(name, user_display, email_type, summary, custom_message)
        msg["To"] = contact
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, _smtp_send, contact, msg)
        print(f"[EMAIL] Sent '{email_type}' to {name} <{contact}>")
        return {**base, "status": "sent", "reason": None}
    except Exception as e:
        print(f"[EMAIL] Failed to send to {name} <{contact}>: {e}")
        return {**base, "status": "failed", "reason": str(e)}
