import html
import re
import unicodedata
from pathlib import Path

import yaml
from langdetect import DetectorFactory, LangDetectException, detect_langs

from config.settings import settings
from src.ingestion.crisis_keywords import scan as scan_crisis

DetectorFactory.seed = 0  # deterministic langdetect

_TAXONOMY_PATH = Path(__file__).resolve().parents[2] / "config" / "subreddit_taxonomy.yaml"


def _load_taxonomy() -> dict[str, str]:
    if not _TAXONOMY_PATH.exists():
        return {}
    raw = yaml.safe_load(_TAXONOMY_PATH.read_text(encoding="utf-8")) or {}
    return {sub.lower(): cat for cat, subs in raw.items() for sub in (subs or [])}


_SUBREDDIT_CATEGORY = _load_taxonomy()


RELEVANT_CATEGORIES = {
    "mental_health",
    "support",
    "support_partner",
    "recovery",
    "trigger",
}


def categorize_subreddit(subreddit: str) -> str:
    return _SUBREDDIT_CATEGORY.get(subreddit.lower(), "general")


_USER_PROFILE_SUB_RE = re.compile(r"^u_[A-Za-z0-9_-]+$")


def is_relevant_subreddit(subreddit: str) -> bool:
    name = subreddit.lower()
    # User-profile subreddits (r/u_<username>) leak identity via the subreddit name itself
    if _USER_PROFILE_SUB_RE.match(name):
        return False
    return categorize_subreddit(name) in RELEVANT_CATEGORIES


_RE_QUOTE = re.compile(r"^>\s?", re.MULTILINE)
_RE_BOLD_ITAL = re.compile(r"(\*{1,3}|_{1,3})(.+?)\1")
_RE_STRIKE = re.compile(r"~~(.+?)~~")
_RE_CODE_BLOCK = re.compile(r"```.*?```", re.DOTALL)
_RE_INLINE_CODE = re.compile(r"`([^`]+)`")
_RE_HEADING = re.compile(r"^#{1,6}\s*", re.MULTILINE)
_RE_LINK = re.compile(r"\[([^\]]+)\]\([^\)]+\)")
_RE_BARE_URL = re.compile(r"https?://\S+")
_RE_SUPER = re.compile(r"\^\(?([^\s\)]+)\)?")
_RE_USER = re.compile(r"/?u/[A-Za-z0-9_-]+")
_RE_SUBR = re.compile(r"/?r/[A-Za-z0-9_]+")
_RE_MULTI_WS = re.compile(r"\s+")

# PII scrubbers - applied to BOTH text and text_raw before storage.
# Mental-health text often contains incidental PII (people sharing phone numbers
# of crisis lines, doctor names, addresses). Strip before persisting.
_RE_EMAIL = re.compile(r"[\w\.\-+]+@[\w\.\-]+\.[A-Za-z]{2,}")
_RE_PHONE = re.compile(
    r"(?<!\d)(?:\+?\d{1,3}[\s\-.]?)?(?:\(?\d{2,4}\)?[\s\-.]?)?\d{3,4}[\s\-.]?\d{4}(?!\d)"
)
_RE_LONGNUM = re.compile(r"(?<!\d)\d{9,}(?!\d)")  # SSN, account numbers, etc.


def scrub_pii(text: str) -> str:
    if not text:
        return text
    text = _RE_EMAIL.sub("<EMAIL>", text)
    text = _RE_PHONE.sub("<PHONE>", text)
    text = _RE_LONGNUM.sub("<NUM>", text)
    return text


def clean_text(raw: str) -> str:
    if not raw:
        return ""
    text = html.unescape(raw)
    text = unicodedata.normalize("NFKC", text)
    text = _RE_CODE_BLOCK.sub(" ", text)
    text = _RE_INLINE_CODE.sub(r"\1", text)
    text = _RE_QUOTE.sub("", text)
    text = _RE_HEADING.sub("", text)
    text = _RE_LINK.sub(r"\1", text)        # keep anchor text, drop URL
    text = _RE_BARE_URL.sub("<URL>", text)
    text = _RE_BOLD_ITAL.sub(r"\2", text)
    text = _RE_STRIKE.sub(r"\1", text)
    text = _RE_SUPER.sub(r"\1", text)
    text = _RE_USER.sub("<USER>", text)
    text = _RE_SUBR.sub("<SUB>", text)
    text = scrub_pii(text)
    text = _RE_MULTI_WS.sub(" ", text).strip()
    return text


def detect_language(text: str) -> tuple[str, float]:
    if len(text) < 20:
        return ("und", 0.0)
    try:
        candidates = detect_langs(text)
        if not candidates:
            return ("und", 0.0)
        top = candidates[0]
        return (top.lang, float(top.prob))
    except LangDetectException:
        return ("und", 0.0)


class CleaningResult:
    __slots__ = ("text", "text_raw", "lang", "lang_confidence", "crisis_hits",
                 "skip_reason")

    def __init__(self, text: str, text_raw: str, lang: str, lang_conf: float,
                 crisis_hits: list[str], skip_reason: str | None = None) -> None:
        self.text = text
        self.text_raw = text_raw
        self.lang = lang
        self.lang_confidence = lang_conf
        self.crisis_hits = crisis_hits
        self.skip_reason = skip_reason

    @property
    def keep(self) -> bool:
        return self.skip_reason is None


def process(raw_body: str) -> CleaningResult:
    """Apply the full cleaning pipeline. Returns a result with .keep flag.

    text_raw in the result IS PII-scrubbed (so audit copies don't preserve
    phone/email/long-numbers). The raw body is never persisted unscrubbed.
    """
    if raw_body in ("[deleted]", "[removed]", None, ""):
        return CleaningResult("", raw_body or "", "und", 0.0, [], skip_reason="deleted")

    cleaned = clean_text(raw_body)
    raw_scrubbed = scrub_pii(raw_body)

    if len(cleaned) < settings.min_text_len:
        return CleaningResult(cleaned, raw_scrubbed, "und", 0.0, [], skip_reason="too_short")
    if len(cleaned) > settings.max_text_len:
        cleaned = cleaned[: settings.max_text_len]

    lang, conf = detect_language(cleaned)
    if lang != "en" or conf < settings.lang_confidence_min:
        return CleaningResult(cleaned, raw_scrubbed, lang, conf, [], skip_reason="non_english")

    crisis = scan_crisis(cleaned)
    return CleaningResult(cleaned, raw_scrubbed, lang, conf, crisis)
