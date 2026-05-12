"""Crisis keyword pre-screen - cheap regex pass for Phase 5 fast-path.

NOT a classifier. Phase 3 (MentalBERT) does the actual severity scoring. This list
exists so an obvious crisis post can trigger an alert before the model job runs.

Patterns adapted from published suicide-risk lexicons (Coppersmith et al. 2018,
"Natural Language Processing of Social Media as Screening for Suicide Risk";
also draws on the U. of Maryland Reddit Self-Harm lexicon). Curated for precision
over recall - false positives here cause unnecessary alerts.

Add new patterns ONLY with a citation in the commit message.
"""
import re

_PATTERNS = [
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

_COMPILED = [re.compile(p, re.IGNORECASE) for p in _PATTERNS]


def scan(text: str) -> list[str]:
    if not text:
        return []
    hits: list[str] = []
    for pattern in _COMPILED:
        m = pattern.search(text)
        if m:
            hits.append(m.group(0).lower())
    return list(dict.fromkeys(hits))  # dedup, preserve order
