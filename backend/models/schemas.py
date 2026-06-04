from pydantic import BaseModel
from typing import Optional


# --- Ingestion ---

class IngestRequest(BaseModel):
    user_id: str

class Post(BaseModel):
    date: str
    subreddit: str
    text: str

class IngestResponse(BaseModel):
    user_id: str
    posts: list[Post]


# --- Graph ---

class GraphNode(BaseModel):
    id: str
    data: dict

class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    data: dict

class GraphDataResponse(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]


# --- NLP ---

class ClassifyRequest(BaseModel):
    user_id: str

class PostSeverityResult(BaseModel):
    post_id: str
    text_snippet: str
    text: str = ""          # full post text — powers the expandable post view
    subreddit: str = ""
    date: str = ""
    severity: str
    confidence: float
    timestamp: str

class ClassifyResponse(BaseModel):
    user_id: str
    results: list[PostSeverityResult]
    aggregate_severity: str
    severity_score: float


# --- Chatbot ---

class ChatRequest(BaseModel):
    user_id: str
    message: str
    conversation_id: Optional[str] = None

class ChatResponse(BaseModel):
    reply: str
    conversation_id: str
    sources: list[str]
    crisis_detected: bool


# --- Response Engine ---

class EvaluateRequest(BaseModel):
    user_id: str

class EvaluateResponse(BaseModel):
    user_id: str
    severity: str
    effective_severity: str
    trend: str                  # "worsening" | "improving" | "stable"
    severity_score: float
    action_taken: str
    contacts_notified: int
    recommendations: list[str]
    helplines: list[dict]


# --- Emergency contact notification flow ---

class NotifyPreviewRequest(BaseModel):
    user_id: str

class NotifyPreviewResponse(BaseModel):
    summary: str                # AI-generated, gentle description of the user's recent state
    subject: str
    body: str                   # full rendered "with_details" email body the contact would receive

class ContactSelection(BaseModel):
    name: str
    contact: str
    custom_message: Optional[str] = None

class SendNotificationRequest(BaseModel):
    user_id: str
    email_type: str             # "check_in" | "with_details" | "custom"
    contacts: list[ContactSelection]

class NotificationResult(BaseModel):
    name: str
    contact: str
    status: str                 # "sent" | "simulated" | "skipped" | "failed"
    reason: Optional[str] = None

class SendNotificationResponse(BaseModel):
    user_id: str
    email_type: str
    sent: int
    failed: int
    skipped: int
    results: list[NotificationResult]


# --- Notifications ---

class Notification(BaseModel):
    from_user: str
    message: str
    timestamp: str

class NotificationsResponse(BaseModel):
    user_id: str
    notifications: list[Notification]


# --- User ---

class EmergencyContact(BaseModel):
    name: str
    contact: str
    notify: bool = True
    # True only once this person has confirmed (via the emailed double-opt-in link)
    # that they agree to receive details. Required before "with_details" / "custom"
    # emails may be sent to them. On input this expresses the *intent* to request
    # their consent; on output it reflects whether consent was actually granted.
    details_consent: bool = False
    # "none"    → no details consent requested for this contact
    # "pending" → a consent-request email was sent, awaiting confirmation
    # "granted" → the contact confirmed via the emailed link
    consent_status: str = "none"
    email_type: str = "check_in"   # legacy default; live choice now made at crisis time
    custom_message: Optional[str] = None
    # NOTE: the per-contact consent_token lives only in MongoDB and is deliberately
    # NOT declared here, so it can never leak into an API response.

class UserProfile(BaseModel):
    user_id: str
    username: str             # Reddit handle (shown once in the dashboard, never in emails)
    display_name: Optional[str] = None  # real name; used across the UI and in emails
    severity_score: float
    severity_label: str
    severity_history: list[dict]
    emergency_contacts: list[EmergencyContact]
    connections: list[dict]
    post_count: int
    consent_given: bool
    last_active: Optional[str]

class ConsentRequest(BaseModel):
    user_id: str
    username: str
    display_name: Optional[str] = None
    emergency_contacts: list[EmergencyContact]
