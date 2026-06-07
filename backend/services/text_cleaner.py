"""Text cleaning + PII scrubbing + subreddit taxonomy for Reddit ingestion."""
import html
import re
import unicodedata
from pathlib import Path

import yaml
from langdetect import DetectorFactory, LangDetectException, detect_langs

DetectorFactory.seed = 0

MIN_TEXT_LEN = 10
MAX_TEXT_LEN = 10_000
LANG_CONFIDENCE_MIN = 0.70

_TAXONOMY_PATH = Path(__file__).resolve().parents[2] / "data" / "subreddit_taxonomy.yaml"


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
    if _USER_PROFILE_SUB_RE.match(name):
        return False
    return categorize_subreddit(name) in RELEVANT_CATEGORIES


# Crisis pre-screen patterns adapted from published suicide-risk lexicons (Coppersmith et al. 2018).
_CRISIS_PATTERNS = [
    r"\bkill (?:myself|me)\b",
    r"\bend (?:it|my life|it all)\b",
    r"\bsuicid(?:e|al|ality)\b",
    r"\b(?:want|going) to die\b",
    r"\bdon'?t want to (?:live|be here|exist|wake up)\b",
    r"\bself[\s\-]?harm\b",
    r"\bcutting myself\b",
    r"\bgoodbye forever\b",
    r"\bno reason to (?:live|go on)\b",
    r"\bbetter off (?:dead|without me)\b",
    r"\bcan'?t (?:do this|take it) anymore\b",
    r"\boverdose\b",
    r"\bhang myself\b",
    r"\bjump off\b",
]
_CRISIS_COMPILED = [re.compile(p, re.IGNORECASE) for p in _CRISIS_PATTERNS]


def scan_crisis(text: str) -> list[str]:
    if not text:
        return []
    hits: list[str] = []
    for pattern in _CRISIS_COMPILED:
        m = pattern.search(text)
        if m:
            hits.append(m.group(0).lower())
    return list(dict.fromkeys(hits))


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

_RE_EMAIL = re.compile(r"[\w\.\-+]+@[\w\.\-]+\.[A-Za-z]{2,}")
_RE_PHONE = re.compile(
    r"(?<!\d)(?:\+?\d{1,3}[\s\-.]?)?(?:\(?\d{2,4}\)?[\s\-.]?)?\d{3,4}[\s\-.]?\d{4}(?!\d)"
)
_RE_LONGNUM = re.compile(r"(?<!\d)\d{9,}(?!\d)")


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
    text = _RE_LINK.sub(r"\1", text)
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
    if raw_body in ("[deleted]", "[removed]", None, ""):
        return CleaningResult("", raw_body or "", "und", 0.0, [], skip_reason="deleted")

    cleaned = clean_text(raw_body)
    raw_scrubbed = scrub_pii(raw_body)

    if len(cleaned) < MIN_TEXT_LEN:
        return CleaningResult(cleaned, raw_scrubbed, "und", 0.0, [], skip_reason="too_short")
    if len(cleaned) > MAX_TEXT_LEN:
        cleaned = cleaned[:MAX_TEXT_LEN]

    lang, conf = detect_language(cleaned)
    if lang != "en" or conf < LANG_CONFIDENCE_MIN:
        return CleaningResult(cleaned, raw_scrubbed, lang, conf, [], skip_reason="non_english")

    crisis = scan_crisis(cleaned)
    return CleaningResult(cleaned, raw_scrubbed, lang, conf, crisis)
