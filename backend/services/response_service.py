from backend.services import mongo_service

# Bump severity one tier up if trend is worsening fast enough
_ESCALATE = {"Low": "Medium", "Medium": "High", "High": "Critical"}


def get_trend(severity_history: list[dict]) -> str:
    """
    Returns 'worsening', 'improving', or 'stable' based on recent score trajectory.
    Compares the latest score against the average of the 3 entries before it.
    """
    if len(severity_history) < 2:
        return "stable"
    recent = severity_history[-1]["score"]
    baseline_entries = severity_history[-4:-1]  # up to 3 entries before the latest
    baseline = sum(e["score"] for e in baseline_entries) / len(baseline_entries)
    delta = recent - baseline
    if delta > 0.12:
        return "worsening"
    if delta < -0.12:
        return "improving"
    return "stable"

HELPLINES = [
    {"name": "iCall (TISS)", "number": "9152987821", "url": "icallhelpline.org"},
    {"name": "Vandrevala Foundation", "number": "1860-2662-345", "url": None},
    {"name": "Snehi", "number": "044-24640050", "url": None},
]

RECOMMENDATIONS = {
    "Low": [
        "Try a 5-minute breathing exercise — inhale 4 counts, hold 4, exhale 4.",
        "Write down 3 things you appreciated about today.",
        "A short walk, even 10 minutes, can shift your mood meaningfully.",
    ],
    "Medium": [
        "Consider reaching out to someone you trust today.",
        "Try the 5-4-3-2-1 grounding technique when feeling overwhelmed.",
        "Aim for 7-8 hours of sleep — it has a direct impact on mood.",
        "Journaling for 15 minutes can help process what you're feeling.",
    ],
    "High": [
        "We strongly encourage speaking with a counsellor or therapist.",
        "iCall (TISS) offers free, confidential support: 9152987821.",
        "Would you like to talk? Opening a chat can be a good first step.",
        "Be gentle with yourself — seeking help is a sign of strength.",
    ],
    "Critical": [
        "Please contact a crisis helpline right now — you deserve immediate support.",
        "If you are in immediate danger, call emergency services.",
        "You are not alone. Help is available and things can get better.",
    ],
}

CHECK_IN_MESSAGE = (
    "Someone you care about may be going through a difficult time right now. "
    "A simple check-in — a message, a call — can make a real difference. "
    "You don't need to have answers; just being present helps."
)


async def evaluate_and_respond(user_id: str) -> dict:
    user = await mongo_service.get_user(user_id)
    if not user:
        raise ValueError(f"User '{user_id}' not found")

    severity_label = user.get("severity_label", "Low")
    severity_score = user.get("severity_score", 0.0)
    severity_history = user.get("severity_history", [])

    # Trajectory: if worsening, escalate one tier for response purposes
    trend = get_trend(severity_history)
    effective_label = severity_label
    if trend == "worsening" and severity_label in _ESCALATE:
        effective_label = _ESCALATE[severity_label]
        print(f"[RESPONSE] Trend is worsening — escalating response from {severity_label} to {effective_label}")

    recommendations = RECOMMENDATIONS.get(effective_label, [])
    if trend == "worsening" and effective_label != severity_label:
        recommendations = [f"⚠️ Your distress level has been increasing recently."] + recommendations
    elif trend == "improving":
        recommendations = ["📈 Things seem to be improving — keep going."] + recommendations

    contacts_notified = 0

    if effective_label == "Critical":
        action = "crisis_escalation"
        contacts = await mongo_service.get_emergency_contacts(user_id)
        for contact in contacts:
            await mongo_service.add_notification(
                user_id, "system",
                "⚠️ Your severity has reached Critical. Please reach out to someone or contact a helpline immediately."
            )
            print(f"[RESPONSE] Would notify emergency contact: {contact['name']} at {contact['contact']}")
            contacts_notified += 1
    elif effective_label == "High":
        action = "strong_suggestion_with_chat_prompt"
    else:
        action = "recommendations"

    return {
        "user_id": user_id,
        "severity": severity_label,
        "effective_severity": effective_label,
        "trend": trend,
        "severity_score": severity_score,
        "action_taken": action,
        "contacts_notified": contacts_notified,
        "recommendations": recommendations,
        "helplines": HELPLINES if effective_label in ("High", "Critical") else [],
    }
