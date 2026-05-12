const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8002/api"

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    })
  } catch {
    throw new Error("Cannot reach the backend. Make sure the server is running on port 8002.")
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? `Request failed (${res.status})`)
  }
  return res.json()
}

// --- Types ---

export interface Post {
  date: string
  subreddit: string
  text: string
}

export interface IngestResponse {
  user_id: string
  posts: Post[]
}

export interface PostSeverityResult {
  post_id: string
  text_snippet: string
  severity: "Low" | "Medium" | "High" | "Critical"
  confidence: number
  timestamp: string
}

export interface ClassifyResponse {
  user_id: string
  results: PostSeverityResult[]
  aggregate_severity: "Low" | "Medium" | "High" | "Critical"
  severity_score: number
}

export interface GraphNode {
  id: string
  data: { label: string; severity: string; score: number }
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  data: { weight: number }
}

export interface GraphDataResponse {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface ChatResponse {
  reply: string
  conversation_id: string
  sources: string[]
  crisis_detected: boolean
}

export interface EvaluateResponse {
  user_id: string
  severity: string
  effective_severity: string
  trend: "worsening" | "improving" | "stable"
  severity_score: number
  action_taken: string
  contacts_notified: number
  recommendations: string[]
  helplines: { name: string; number: string; url: string | null }[]
}

export interface UserProfile {
  user_id: string
  username: string
  severity_score: number
  severity_label: string
  severity_history: { label: string; score: number; timestamp: string }[]
  emergency_contacts: { name: string; contact: string }[]
  connections: { peer_id: string; weight: number }[]
  post_count: number
  consent_given: boolean
  last_active: string | null
}

export interface Notification {
  from_user: string
  message: string
  timestamp: string
}

export interface AdminUser {
  user_id: string
  username: string
  severity_label: string
  severity_score: number
  post_count: number
  classified_count: number
  last_active: string | null
  contacts_count: number
  consent_given: boolean
}

export interface AdminResponse {
  users: AdminUser[]
  stats: {
    total_users: number
    severity_distribution: Record<string, number>
    critical_count: number
    high_count: number
  }
}

// --- API calls ---

export const api = {
  ingest: (userId: string) =>
    req<IngestResponse>("/ingest", { method: "POST", body: JSON.stringify({ user_id: userId }) }),

  classify: (userId: string) =>
    req<ClassifyResponse>("/classify", { method: "POST", body: JSON.stringify({ user_id: userId }) }),

  graphData: (userId: string) =>
    req<GraphDataResponse>(`/graph/data?user_id=${userId}`),

  graphUser: (userId: string) =>
    req<UserProfile>(`/graph/user/${userId}`),

  chatHistory: (userId: string) =>
    req<{ user_id: string; history: { role: string; content: string; timestamp: string }[] }>(`/chat/history/${userId}`),

  chat: (userId: string, message: string, conversationId?: string) =>
    req<ChatResponse>("/chat", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, message, conversation_id: conversationId }),
    }),

  evaluate: (userId: string) =>
    req<EvaluateResponse>("/evaluate", { method: "POST", body: JSON.stringify({ user_id: userId }) }),

  notifications: (userId: string) =>
    req<{ user_id: string; notifications: Notification[] }>(`/notify/${userId}`),

  updateContacts: (userId: string, contacts: { name: string; contact: string }[]) =>
    req<{ status: string }>(`/graph/user/${userId}/contacts`, {
      method: "PUT",
      body: JSON.stringify({ emergency_contacts: contacts }),
    }),

  clearPosts: (userId: string) =>
    req<{ status: string }>(`/graph/user/${userId}/posts`, { method: "DELETE" }),

  deleteAccount: (userId: string) =>
    req<{ status: string }>(`/graph/user/${userId}`, { method: "DELETE" }),

  adminData: () => req<AdminResponse>("/admin/users"),
}
