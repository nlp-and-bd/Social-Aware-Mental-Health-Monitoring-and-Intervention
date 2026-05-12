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

class UserProfile(BaseModel):
    user_id: str
    username: str
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
    emergency_contacts: list[EmergencyContact]
