from backend.services import mongo_service, email_service

_ESCALATE = {"Low": "Medium", "Medium": "High", "High": "Critical"}


def get_trend(severity_history: list[dict]) -> str:
    if len(severity_history) < 2:
        return "stable"
    recent = severity_history[-1]["score"]
    baseline_entries = severity_history[-4:-1]
    baseline = sum(e["score"] for e in baseline_entries) / len(baseline_entries)
    delta = recent - baseline
    if delta > 0.12:
        return "worsening"
    if delta < -0.12:
        return "improving"
    return "stable"


# Helpline numbers verified against Government of India / NGO sources (June 2026):
#   Tele-MANAS (national, 24/7, 20 languages)  14416 / 1-800-891-4416
#   KIRAN (MoSJE, national, 24/7, 13 languages) 1800-599-0019
#   iCall (TISS)                                 9152987821
#   Vandrevala Foundation (24/7)                 9999666555
#   AASRA (Mumbai, 24/7)                         9820466726
#   NIMHANS psychosocial support                 080-46110007
#   National emergency number                    112
HELPLINES: dict[str, list[dict]] = {
    # Even when someone is doing well, one always-available, no-pressure option.
    "Low": [
        {"name": "Tele-MANAS (Govt. of India, 24/7)", "number": "14416", "url": "telemanas.mohfw.gov.in"},
    ],
    "Medium": [
        {"name": "Tele-MANAS (Govt. of India, 24/7)", "number": "14416", "url": "telemanas.mohfw.gov.in"},
        {"name": "iCall (TISS) — free counselling", "number": "9152987821", "url": "icallhelpline.org"},
        {"name": "Vandrevala Foundation (24/7)", "number": "9999666555", "url": "vandrevalafoundation.com"},
    ],
    "High": [
        {"name": "Tele-MANAS (Govt. of India, 24/7)", "number": "14416", "url": "telemanas.mohfw.gov.in"},
        {"name": "iCall (TISS) — free counselling", "number": "9152987821", "url": "icallhelpline.org"},
        {"name": "Vandrevala Foundation (24/7)", "number": "9999666555", "url": "vandrevalafoundation.com"},
        {"name": "KIRAN (MoSJE, 24/7)", "number": "1800-599-0019", "url": None},
        {"name": "NIMHANS psychosocial support", "number": "080-46110007", "url": None},
    ],
    "Critical": [
        {"name": "Tele-MANAS (Govt. of India, 24/7)", "number": "14416", "url": "telemanas.mohfw.gov.in"},
        {"name": "AASRA (24/7 crisis line)", "number": "9820466726", "url": "aasra.info"},
        {"name": "iCall (TISS)", "number": "9152987821", "url": "icallhelpline.org"},
        {"name": "Vandrevala Foundation (24/7)", "number": "9999666555", "url": "vandrevalafoundation.com"},
        {"name": "KIRAN (MoSJE, 24/7)", "number": "1800-599-0019", "url": None},
        {"name": "Emergency services (immediate danger)", "number": "112", "url": None},
    ],
}

RECOMMENDATIONS: dict[str, list[str]] = {
    "Low": [
        "Things look steady right now — a good moment to notice what's actually working in your life.",
        "Anchor one small daily ritual you enjoy: a morning coffee, a walk, a few pages of a book.",
        "Try a short gratitude note tonight — three things, however small, that you appreciated today.",
        "Keep your supports warm: a quick message to a friend now makes it easier to reach out later.",
        "Ten minutes of movement or fresh air is one of the most reliable ways to protect your mood.",
    ],
    "Medium": [
        "Some stress is showing up. Naming what's weighing on you — out loud or on paper — often shrinks it.",
        "When you feel overwhelmed, try 5-4-3-2-1 grounding: 5 things you see, 4 you hear, 3 you can touch, 2 you smell, 1 you taste.",
        "Protect your sleep this week — 7–8 hours has a direct, measurable effect on how you feel.",
        "Pick one worry you can act on and take the smallest next step; let the rest wait.",
        "A free, confidential chat can help you sort through things — Tele-MANAS (14416) or iCall (9152987821).",
        "Reach out to one person you trust today, even just to say you've had a hard week.",
    ],
    "High": [
        "What you're carrying sounds heavy, and it's completely valid. You don't have to hold it alone.",
        "Talking to a counsellor would genuinely help — Tele-MANAS (14416) and iCall (9152987821) are free and confidential.",
        "Shrink today to its smallest pieces: a glass of water, a shower, one text. Each one counts.",
        "Tell one trusted person how you're really doing — being witnessed eases the weight.",
        "Try to keep regular meals and sleep, even loosely; your body and mood are closely linked.",
        "Reaching out is a sign of strength, not weakness — and support is available whenever you're ready.",
    ],
    "Critical": [
        "Your safety matters most right now. Please reach a crisis line — Tele-MANAS 14416 or AASRA 9820466726, both 24/7.",
        "If you feel you might act on thoughts of harming yourself, call emergency services (112) now.",
        "Please don't be alone with this — tell someone nearby, or let a trusted person stay with you.",
        "These feelings are real, but they are not permanent. With support, they can ease.",
        "If you've set emergency contacts, you can choose to alert them from here so someone can check in on you.",
    ],
}


async def _generate_recommendations(severity: str, user_context: dict) -> list[str]:
    """Ask the RAG LLM for personalised recommendations. Falls back to static on error."""
    try:
        from backend.services import rag_service
        posts = user_context.get("recent_posts", [])
        snippets = "\n".join(
            f"- \"{p['text_snippet'][:120]}\" ({p['severity']})"
            for p in posts[:4]
        )
        prompt = (
            f"A user is experiencing {severity}-level mental distress. "
            f"Their recent posts:\n{snippets}\n\n"
            f"Give exactly 4 concise, warm, actionable recommendations tailored to what they wrote. "
            f"Return only a plain numbered list (1. ... 2. ... 3. ... 4. ...). "
            f"Do not add headers, asterisks, or extra text."
        )
        result = await rag_service.chat(prompt, [], user_context)
        lines = [
            ln.lstrip("0123456789. ").strip()
            for ln in result["reply"].split("\n")
            if ln.strip() and ln.strip()[0].isdigit()
        ]
        if len(lines) >= 2:
            return lines[:4]
    except Exception as e:
        print(f"[RESPONSE] RAG recommendation generation failed: {e}")
    return RECOMMENDATIONS.get(severity, [])


async def _gather(user_id: str) -> dict:
    """
    Fetch a user and derive everything the response layer needs: trend,
    effective (possibly escalated) severity, and a RAG-ready user_context.
    Shared by evaluate_and_respond, preview_notification and send_notifications.
    """
    user = await mongo_service.get_user(user_id)
    if not user:
        raise ValueError(f"User '{user_id}' not found")

    severity_label = user.get("severity_label", "Low")
    severity_score = user.get("severity_score", 0.0)
    severity_history = user.get("severity_history", [])

    trend = get_trend(severity_history)
    effective_label = severity_label
    if trend == "worsening" and severity_label in _ESCALATE:
        effective_label = _ESCALATE[severity_label]

    posts = await mongo_service.get_all_posts(user_id)
    classified = sorted(
        [p for p in posts if p.get("severity")],
        key=lambda p: p.get("classified_at") or "",
        reverse=True,
    )
    user_context = {
        "severity_label": effective_label,
        "severity_score": severity_score,
        "recent_posts": [
            {"text_snippet": p.get("text", "")[:200], "severity": p.get("severity", ""), "confidence": p.get("confidence", 0.0)}
            for p in classified[:4]
        ],
    }
    return {
        "user": user,
        # Real name only — the user's Reddit handle must NEVER appear in any email.
        "user_display": user.get("display_name") or "Someone who trusts you",
        "severity_label": severity_label,
        "severity_score": severity_score,
        "trend": trend,
        "effective_label": effective_label,
        "user_context": user_context,
    }


async def evaluate_and_respond(user_id: str) -> dict:
    """
    Assess a user and return recommendations + helplines. This is read-only:
    it never sends email and never queues notifications. When the user is
    Critical, action_taken == "prompt_notification" signals the UI to offer the
    consent-driven emergency-contact flow (preview_notification / send_notifications).
    """
    g = await _gather(user_id)
    effective_label = g["effective_label"]
    trend = g["trend"]

    if trend == "worsening" and effective_label != g["severity_label"]:
        print(f"[RESPONSE] Worsening trend — escalating {g['severity_label']} → {effective_label}")

    recommendations = await _generate_recommendations(effective_label, g["user_context"])
    if trend == "worsening":
        recommendations = ["Your distress level has been increasing recently. Please take this seriously."] + recommendations
    elif trend == "improving":
        recommendations = ["Things seem to be moving in a better direction — keep going."] + recommendations

    if effective_label == "Critical":
        action = "prompt_notification"
    elif effective_label == "High":
        action = "strong_suggestion_with_chat_prompt"
    else:
        action = "recommendations"

    return {
        "user_id": user_id,
        "severity": g["severity_label"],
        "effective_severity": effective_label,
        "trend": trend,
        "severity_score": g["severity_score"],
        "action_taken": action,
        "contacts_notified": 0,
        "recommendations": recommendations,
        "helplines": HELPLINES.get(effective_label, []),
    }


async def preview_notification(user_id: str) -> dict:
    """
    Build the exact 'with_details' email the user's contacts would receive, so the
    UI can show it before anything is sent. Returns the AI summary + rendered body.
    """
    g = await _gather(user_id)
    summary = await email_service.generate_state_summary(g["user_context"])
    body = email_service.render_body(
        contact_name="[their name]",
        user_display=g["user_display"],
        email_type="with_details",
        summary=summary,
        custom_message=None,
    )
    return {"summary": summary, "subject": email_service.SUBJECT, "body": body}


async def send_notifications(user_id: str, email_type: str, contacts: list[dict]) -> dict:
    """
    Send the chosen message to the user-selected contacts, write an audit log, and
    queue a single confirmation notification for the user.

    `contacts` is a list of {name, contact, custom_message?} chosen live by the user.
    Consent gating (details_consent) is enforced here as a safety net: with_details
    and custom may only go to contacts the user has marked as details_consent=True.
    """
    g = await _gather(user_id)

    if email_type not in ("check_in", "with_details", "custom"):
        email_type = "check_in"

    # Look up stored consent per contact (safety net behind the UI gating).
    stored = await mongo_service.get_emergency_contacts(user_id)
    consent_by_contact = {c.get("contact"): c.get("details_consent", False) for c in stored}
    # Only the user's own saved emergency contacts may be messaged — prevents the
    # endpoint from being used to email arbitrary addresses supplied in the request.
    saved_contacts = {c.get("contact") for c in stored if c.get("contact")}

    summary = ""
    if email_type == "with_details":
        summary = await email_service.generate_state_summary(g["user_context"])

    results: list[dict] = []
    for c in contacts:
        name = c.get("name", "")
        contact_val = c.get("contact", "")
        custom_message = c.get("custom_message")
        if contact_val not in saved_contacts:
            results.append({"name": name, "contact": contact_val, "status": "skipped",
                            "reason": "not one of your saved emergency contacts"})
            continue
        if email_type in ("with_details", "custom") and not consent_by_contact.get(contact_val, False):
            results.append({"name": name, "contact": contact_val, "status": "skipped",
                            "reason": "contact has not consented to receive details"})
            continue
        res = await email_service.send_one(
            name, contact_val, g["user_display"], email_type, summary, custom_message,
        )
        results.append(res)

    await mongo_service.add_notification_log(user_id, email_type, results)

    sent = sum(1 for r in results if r["status"] in ("sent", "simulated"))
    failed = sum(1 for r in results if r["status"] == "failed")
    skipped = sum(1 for r in results if r["status"] == "skipped")

    if sent:
        await mongo_service.add_notification(
            user_id, "system",
            f"You reached out to {sent} emergency contact{'s' if sent != 1 else ''}. "
            f"They've been gently asked to check in on you. You're not alone.",
        )

    return {
        "user_id": user_id,
        "email_type": email_type,
        "sent": sent,
        "failed": failed,
        "skipped": skipped,
        "results": results,
    }
