from datetime import datetime, timezone
from pathlib import Path
from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification
import torch
from backend.config import settings

# Crisis phrases that bypass the model and immediately return Critical
CRISIS_KEYWORDS = [
    "end my life", "want to die", "kill myself", "not worth living",
    "better off without me", "suicide", "suicidal", "no reason to live",
    "can't go on", "want it to end", "ending it all", "harm myself",
    "self harm", "cut myself", "don't want to be here anymore",
]

SEVERITY_LABELS = ["Low", "Medium", "High", "Critical"]

SEVERITY_WEIGHTS = {"Low": 1, "Medium": 2, "High": 3, "Critical": 4}

_classifier = None


def _try_load(source: str) -> tuple | None:
    """Returns (tokenizer, model) or None if loading fails for any reason."""
    try:
        tokenizer = AutoTokenizer.from_pretrained(source)
        model     = AutoModelForSequenceClassification.from_pretrained(source)
        return tokenizer, model
    except Exception as e:
        print(f"[NLP] Could not load from '{source}': {e}")
        return None


def load_model():
    global _classifier

    local_v2  = settings.MENTALBERT_MODEL_PATH           # ./models/v2
    local_v1  = str(Path(local_v2).parent / "v1")        # ./models/v1

    # Priority: HF v2 → local v2 → local v1 → HF emotion fallback
    candidates = [
        ("aiguanai/mentalbert-mental-health-v2", "HuggingFace v2"),
        (local_v2,                               "local v2"),
        (local_v1,                               "local v1"),
        ("j-hartmann/emotion-english-distilroberta-base", "HuggingFace emotion fallback"),
    ]

    tokenizer = model = None
    for source, label in candidates:
        # Skip local paths that don't exist (avoids pointless download attempt)
        if source.startswith(".") and not Path(source).exists():
            print(f"[NLP] Skipping '{label}' — path not found.")
            continue
        print(f"[NLP] Trying {label} ({source})…")
        result = _try_load(source)
        if result:
            tokenizer, model = result
            print(f"[NLP] Loaded from {label}.")
            break

    if model is None:
        raise RuntimeError("[NLP] All model sources failed. Check network or local model files.")

    device = 0 if torch.cuda.is_available() else -1
    _classifier = pipeline(
        "text-classification",
        model=model,
        tokenizer=tokenizer,
        device=device,
        top_k=None,
    )
    print("[NLP] Model ready.")


def crisis_keyword_check(text: str) -> bool:
    text_lower = text.lower()
    return any(kw in text_lower for kw in CRISIS_KEYWORDS)


# MentalBERT 7-class → severity mapping
_MENTALBERT_MAP = {
    "Normal":               "Low",
    "Anxiety":              "Medium",
    "Stress":               "Medium",
    "Depression":           "High",
    "Bipolar":              "High",
    "Personality disorder": "High",
    "Suicidal":             "Critical",
}

# Fallback emotion model → severity mapping
_EMOTION_MAP = {
    "joy":      "Low",
    "surprise": "Low",
    "love":     "Low",
    "neutral":  "Medium",
    "disgust":  "Medium",
    "fear":     "High",
    "anger":    "High",
    "sadness":  "High",
}


def classify_text(text: str) -> dict:
    """
    Returns {"severity": str, "confidence": float}
    Crisis keyword check must be called before this.
    """
    truncated = text[:512]
    raw = _classifier(truncated)
    scores = raw[0]  # list of {"label": ..., "score": ...}

    top = max(scores, key=lambda x: x["score"])
    label = top["label"]

    if label in _MENTALBERT_MAP:
        severity = _MENTALBERT_MAP[label]
    elif label.lower() in _EMOTION_MAP:
        severity = _EMOTION_MAP[label.lower()]
    else:
        severity = "Medium"

    return {"severity": severity, "confidence": round(top["score"], 4)}


def aggregate_severity(results: list[dict]) -> tuple[str, float]:
    """
    Computes a recency-weighted aggregate severity score.
    Posts decay in influence by half every 30 days — a post from yesterday
    counts ~30x more than one from 6 months ago.
    """
    if not results:
        return "Low", 0.0

    now = datetime.now(timezone.utc)
    total_weight = 0.0
    weighted_sum = 0.0

    for r in results:
        # Recency weight: 1.0 at 0 days old, ~0.5 at 30 days, ~0.03 at 120 days
        try:
            post_date = datetime.fromisoformat(r.get("date", "")).replace(tzinfo=timezone.utc)
            days_ago = max((now - post_date).days, 0)
        except (ValueError, TypeError):
            days_ago = 0
        recency_weight = 1 / (1 + days_ago / 30)

        severity_score = SEVERITY_WEIGHTS[r["severity"]] * r["confidence"]
        weighted_sum  += severity_score * recency_weight
        total_weight  += 4 * recency_weight  # 4 is max possible severity weight

    score = weighted_sum / total_weight if total_weight else 0.0

    if score < 0.30:
        return "Low",      round(score, 4)
    if score < 0.55:
        return "Medium",   round(score, 4)
    if score < 0.75:
        return "High",     round(score, 4)
    return "Critical", round(score, 4)
