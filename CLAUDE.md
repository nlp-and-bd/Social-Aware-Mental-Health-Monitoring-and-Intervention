# Penumbra — CLAUDE.md

Mental health early-detection pipeline. Reddit posts → MentalBERT classification → MongoDB → RAG chatbot + emergency contact alerts.

---

## Running the project

```bash
# Backend (port 8002 — teammate owns 8000/8001)
uvicorn backend.main:app --reload --reload-dir backend --port 8002

# Frontend
cd frontend && npm run dev   # http://localhost:3000
```

Frontend API base: `NEXT_PUBLIC_API_URL=http://localhost:8002/api` in `frontend/.env.local`.
**GOTCHA**: `api.ts` line 1 hardcodes fallback `"http://localhost:8002/api"`. Linter or copilot occasionally reverts it to 8000 — fix back manually.

---

## Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI + Motor (async MongoDB) |
| Database | MongoDB Atlas (`mental_health_db`) |
| NLP | MentalBERT fine-tuned (7 classes) — `aiguanai/mentalbert-mental-health-v2` on HuggingFace first, local `./models/v2` fallback |
| RAG | Pinecone + OpenAI `gpt-4o-mini`; MongoDB Atlas `$vectorSearch` when `MONGODB_VECTOR_INDEX` is set |
| Frontend | Next.js 16 (App Router) + React 19, TypeScript, Tailwind v4, shadcn/ui, Framer Motion, Recharts, React Flow (`@xyflow/react`) |
| Email | SMTP (Gmail) for emergency-contact alerts + double opt-in consent confirmation |

---

## Key files

```
backend/
  main.py                    # FastAPI app, lifespan (DB + model + RAG init)
  config.py                  # All env vars via pydantic-settings
  routers/
    auth.py                  # POST /api/auth/mock-login (simulated Reddit OAuth)
    ingestion.py             # POST /api/ingest
    nlp.py                   # POST /api/classify
    chatbot.py               # POST /api/chat, GET /api/chat/history/{id}
    response_engine.py       # POST /api/evaluate, /notify/preview, /notify/send; GET /api/notify/{id}
    graph.py                 # User profile CRUD, contacts, consent
    contacts.py              # GET /api/contacts/consent/confirm (double opt-in landing page)
    admin.py                 # POST /api/admin/token, GET /api/admin/users (JWT-protected)
  services/
    mongo_service.py         # All MongoDB ops
    nlp_service.py           # MentalBERT loader + crisis keyword check + classify_text + aggregate_severity
    rag_service.py           # Vector search + OpenAI RAG chat + embed/similarity helpers + CAG session cache
    response_service.py      # Helplines + RAG-generated recommendations; triggers email on Critical
    email_service.py         # SMTP send (threaded), check-in / with-details / consent-confirm templates
    contact_service.py       # Emergency-contact CRUD + double opt-in consent tokens
    reddit_mock.py           # Loads data/mock_reddit_posts.json (get_posts_for_user interface) — demo users
    reddit_api.py            # Real asyncpraw fetch (last 90d, cleaned/PII-scrubbed) — same get_posts_for_user interface
    text_cleaner.py          # Markdown strip + PII scrub + langdetect + subreddit taxonomy (used by reddit_api)
    auth_service.py          # Reddit OAuth: get_reddit_authorize_url(state) + get_reddit_user_id(code) via asyncpraw
  models/
    schemas.py               # Pydantic request/response models (NOT ML model files — do not gitignore)

frontend/
  app/page.tsx               # Login page — real Reddit OAuth + username fallback + 4 demo users
  app/admin/page.tsx         # Admin dashboard (JWT login overlay)
  app/dashboard/[userId]/page.tsx  # Per-user dashboard (auto-ingest+classify on load; 4 tabs)
  components/
    FloatingChat.tsx         # Bottom-right FAB chat widget (56px purple circle)
    ChatInterface.tsx        # Chat bubbles + quick-start chips + history
    NatureBackground.tsx     # Studio-Ghibli SVG background (light/dark aware, fractal blossom trees)
    AuroraBackground.tsx     # Login page background (left panel)
    ConsentScreen.tsx        # Blocking consent + display name + contacts capture (new users)
    SettingsPanel.tsx        # Profile, contacts editor, consent toggles, danger zone
    SeverityTimeline.tsx     # Severity-over-time line chart (Overview hero)
    SeverityBreakdown.tsx    # Severity distribution donut (Overview)
    ActivityHeatmap.tsx      # GitHub-style post activity grid (Overview)
    PostList.tsx             # Classified posts + full-text modal (Posts tab)
    CrisisPanel.tsx          # Critical-severity flow: helplines + stepped contact-alert dialog
    SupportNetwork.tsx       # Emergency-contacts graph (Actions tab)
    SeverityBadge.tsx        # Severity pill + severityColor() helper
    ThemeToggle.tsx          # Light/dark toggle
  lib/api.ts                 # All typed fetch wrappers
```

---

## Environment variables (`.env` at project root)

```
MONGODB_URI=mongodb+srv://...
MONGODB_DB=mental_health_db

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini

MENTALBERT_MODEL_PATH=./models/v2     # local fallback; HF is tried first

EMBEDDING_MODEL=all-MiniLM-L6-v2

# Pinecone (primary when MongoDB vector index is not set)
PINECONE_API_KEY=
PINECONE_INDEX=
PINECONE_CLOUD=aws
PINECONE_REGION=us-east-1

# MongoDB Atlas Vector Search (optional; if set, takes priority over Pinecone)
MONGODB_VECTOR_INDEX=
MONGODB_VECTOR_COLLECTION=mental_health_resources
MONGODB_VECTOR_FIELD=embedding

# SMTP email for emergency contacts
SMTP_ENABLED=false
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=                        # Gmail App Password (not account password)
SMTP_FROM=Penumbra <noreply@example.com>

# Public base URL used to build links in outgoing emails
# (e.g. the emergency-contact consent-confirmation page)
PUBLIC_BASE_URL=http://localhost:8002

# Admin dashboard
ADMIN_PASSWORD=pokemon123             # default in config.py; override in .env
JWT_SECRET=change-me-in-production

# Reddit OAuth (live). App MUST be type "web app" with the redirect URI below.
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_USER_AGENT=python:penumbra:1.0.0 (by /u/<your_reddit_username>)
REDDIT_REDIRECT_URI=http://localhost:8002/api/auth/callback
REDDIT_OAUTH_SCOPES=identity          # login only needs identity
REDDIT_RECENT_WINDOW_DAYS=90          # on-login ingestion recency floor
FRONTEND_BASE_URL=http://localhost:3000   # OAuth callback redirects the browser here

HF_HUB_DISABLE_SYMLINKS_WARNING=1
```

---

## Auth model

| Actor | Mechanism |
|---|---|
| Users (real) | Reddit OAuth. `GET /api/auth/reddit` → consent → `GET /api/auth/callback` resolves the username (identity scope), find-or-creates the user with `source:"reddit"`, runs on-login ingestion, then redirects to `/dashboard/{user_id}`. Requires a **web app** type Reddit app. |
| Users (fallback) | `POST /api/auth/mock-login` — username → find or create (`source:"mock"`). Works without OAuth credentials. |
| Admin | JWT. `POST /api/admin/token` with `ADMIN_PASSWORD` → 8h token, stored in `sessionStorage["admin_token"]`. |
| Demo users | u001 (Critical), u002 (Low), u003 (High), u004 (Medium). Bypass login → direct to dashboard. |

New users (mock or Reddit) get `consent_given: false` → consent screen shown by dashboard on load.
The `source` field on the user doc drives ingestion: `"reddit"` fetches live via `reddit_api`, anything else uses `reddit_mock`.

---

## NLP — model loading chain

Priority order (first success wins):
1. `aiguanai/mentalbert-mental-health-v2` — HuggingFace (requires network)
2. `./models/v2` — local (skipped silently if path not found)
3. `./models/v1` — local (skipped silently if path not found)
4. `j-hartmann/emotion-english-distilroberta-base` — HuggingFace fallback

First run downloads ~438MB from HuggingFace; cached at `~/.cache/huggingface/` afterwards.

## NLP — severity mapping

MentalBERT 7 classes → 4 tiers:

| MentalBERT label | Severity tier |
|---|---|
| Normal | Low |
| Anxiety, Stress | Medium |
| Depression, Bipolar, Personality disorder | High |
| Suicidal | Critical |

Crisis keyword check runs **before** model — bypass to Critical immediately on match.

Crisis keywords include: "end my life", "want to die", "kill myself", "not worth living", "suicide", "suicidal", "no reason to live", "harm myself", "self harm", etc.

## NLP — aggregate severity

`aggregate_severity()` computes **recency-weighted** score across all a user's posts:
- Weight decay: `1 / (1 + days_ago / 30)` — post from yesterday = ~30× weight vs. 6-month-old post
- Thresholds: `< 0.30 → Low`, `< 0.55 → Medium`, `< 0.75 → High`, `≥ 0.75 → Critical`

---

## RAG chatbot

**Pinecone** (primary when `MONGODB_VECTOR_INDEX` not set):
- Index name from `PINECONE_INDEX`
- Knowledge base: `data/mental_health_resources.json` (~20-30 docs on anxiety, depression, coping, crisis)
- Indexed once at startup if the index is empty
- Embedding model: `all-MiniLM-L6-v2`

**MongoDB Atlas `$vectorSearch`** (activates when `MONGODB_VECTOR_INDEX` env var is set):
- Teammate adds the vector index on the `mental_health_resources` collection
- Set `MONGODB_VECTOR_INDEX=<index_name>` to activate; Pinecone is still kept as fallback

**OpenAI `gpt-4o-mini`** for generation. System prompt injects:
1. Base Penumbra guidelines (listen/reflect, no diagnosis, no advice)
2. `USER PROFILE` block: severity label + score + theme + up to 5 recent post snippets
3. `USER'S OWN RECENT REDDIT POSTS` — semantic retrieval (cosine top-3) over the user's own
   posts from the last 90 days (`mongo_service.get_recent_posts` → `rag_service.rank_by_similarity`)
4. `RELEVANT PAST CONVERSATION` — semantic retrieval over the user's prior-session chat turns
   (current session excluded; embedded on the fly)
5. Retrieved knowledge-base RAG chunks (do not quote verbatim)

**Personal RAG vs CAG:**
- **RAG (cross-session, persistent)** — own 90-day posts + past chat history, retrieved by cosine
  similarity to the current message. Real Reddit posts store an `embedding` at ingest time;
  mock posts and chat turns are embedded on demand.
- **CAG (current session, in-memory)** — `rag_service._session_cache` keyed by `conversation_id`
  holds the running session turns so the LLM context is served from memory, not a Mongo read each
  turn. Seeded from `get_session_history` on a cache miss; turns still persist to `chat_history`
  for durability. Caps: 20 turns/session, 500 sessions (oldest evicted).

**Guardrails:**
- Never advise ("you should do X") — only reflect and ask
- Always end with suggestion to speak to a professional
- Crisis language mid-chat → prioritise helpline referral, no normal response (fast-path runs before retrieval)

---

## Response engine

`evaluate_and_respond(user_id)` flow:

1. Fetch user from MongoDB → severity label, score, history
2. Compute trend (last score vs. average of previous 3):
   - `> +0.12` → worsening → escalate one tier (e.g. High → Critical)
   - `< -0.12` → improving
3. Build `user_context` dict (severity + recent 4 posts) → pass to RAG for personalised recommendations
4. Prepend trend note to recommendations
5. **Critical** (or escalated to Critical):
   - Fetch emergency contacts → send SMTP email per contact (async, fire-and-forget, failure silent)
   - Write "Critical" notification to user's MongoDB `notifications[]`
   - Email content: generic check-in only — no diagnosis, no post content, no score
6. Return full response dict including helplines keyed by effective severity

## Helplines per severity

| Severity | Helplines |
|---|---|
| Low | (none) |
| Medium | iCall (TISS) 9152987821, Vandrevala Foundation 1860-2662-345 |
| High | iCall, Vandrevala, NIMHANS 080-46110007, Sumaitri 011-23389090 |
| Critical | iCall, Vandrevala, AASRA 9820466627, NIMHANS, Connecting NGO 1800-843-4353, iCall Chat |

## Emergency contact alerts

Two paths can email a user's emergency contacts; both go through `email_service.py` (SMTP on a worker thread).

- **Automatic (Critical)** — `evaluate` fires a generic check-in to every contact with `notify !== false`. No diagnosis, no score, no post text, and **never the Reddit username** — only the user's chosen display name.
- **Manual (CrisisPanel)** — `POST /api/notify/send` with a `mode`:
  - `check_in` — generic "thinking of you" (no details).
  - `with_details` — only to contacts who set `details_consent: true` (double opt-in).
  - `custom` — user-written message per contact.
- **Double opt-in** — a contact only counts as consented after they click the link in the consent email, which lands on `GET /api/contacts/consent/confirm`. `with_details` is gated on this.
- `notify/send` validates submitted contacts against the user's saved contacts — you can't email an arbitrary address.

---

## Dashboard behaviour

- **On load**: auto-ingest → auto-classify → auto-evaluate. No manual button.
- **Tabs** (4 — share loaded state, no per-tab re-fetch):
  - **Overview** — analytics home: severity-over-time line (hero) + severity-breakdown donut + activity heatmap (two-up).
  - **Posts** — classified post list with full-text modal.
  - **Actions** — recommended steps + helplines + support-network graph (contacts who'd be alerted) + Critical crisis flow.
  - **Settings** — profile, contacts editor, consent toggles, danger zone.
  - (The former standalone **Insights** tab was merged into Overview; the support network moved to Actions.)
- **Chat**: floating FAB bottom-right (56px purple circle), AnimatePresence panel (380×540px). NOT a tab.
- **NatureBackground**: Studio-Ghibli SVG behind all content at `z-index: 0`. Uses deterministic PRNG `mulberry32(20260601)` for SSR stability. Fractal cherry blossom trees, god-rays, floating petals (22), dandelion seeds (18), sparks (26), bottom flowers. Light/dark aware via CSS `.dark` class.
- **CrisisPanel**: shown when `effective_severity === "Critical"`. Shows helplines + "your contacts have been alerted" notice.
- **Consent screen**: shown on load if `consent_given: false`. Blocks dashboard until accepted.

---

## API endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/mock-login` | `{username}` → find/create user (`source:"mock"`) → `{user_id, is_new}` |
| GET | `/api/auth/reddit` | Redirect to Reddit OAuth consent (identity). 501 if credentials unset. |
| GET | `/api/auth/callback` | `?code&state` → resolve username → find/create (`source:"reddit"`) → ingest → redirect to frontend dashboard |
| POST | `/api/admin/token` | `{password}` → JWT (8h) |
| GET | `/api/admin/users` | All users + stats (JWT required) |
| POST | `/api/ingest` | `{user_id}` → source-aware pull (reddit_api if `source:"reddit"`, else reddit_mock) → upsert to MongoDB |
| POST | `/api/classify` | `{user_id}` → classify unclassified posts → update severity |
| POST | `/api/evaluate` | `{user_id}` → trend check → recommendations → SMTP if Critical |
| POST | `/api/notify/preview` | `{user_id}` → preview the email that would be sent to each contact |
| POST | `/api/notify/send` | `{user_id, mode, contacts[]}` → send check-in / with-details / custom alerts |
| GET | `/api/notify/{id}` | Pop + return pending notifications |
| GET | `/api/contacts/consent/confirm` | Double opt-in landing page a contact hits from the consent email (HTML) |
| POST | `/api/chat` | `{user_id, message, conversation_id?}` → RAG reply |
| GET | `/api/chat/history/{id}` | Full chat history for user |
| GET | `/api/graph/data?user_id=X` | Ego network nodes + edges for React Flow |
| GET | `/api/graph/user/{id}` | Full user profile (UserProfile type) |
| PUT | `/api/graph/user/{id}/contacts` | Update emergency contacts |
| POST | `/api/graph/user/{id}/consent` | Set consent + username + contacts |
| DELETE | `/api/graph/user/{id}/posts` | Clear posts + reset severity |
| DELETE | `/api/graph/user/{id}` | Delete user + all posts |

---

## MongoDB schema

Database: `mental_health_db`

### Collection: `users`
```json
{
  "_id": "u001",
  "username": "user_alpha",
  "severity_score": 0.82,
  "severity_label": "Critical",
  "severity_history": [
    {"label": "Medium", "score": 0.45, "timestamp": "2024-01-10T10:00:00Z"}
  ],
  "emergency_contacts": [
    {"name": "Jane", "contact": "jane@email.com"}
  ],
  "connections": [
    {"peer_id": "u002", "weight": 1.0}
  ],
  "post_ids": ["u001_2024-01-10_depression"],
  "chat_history": [
    {"role": "user", "content": "...", "timestamp": "...", "conversation_id": "..."}
  ],
  "notifications": [],
  "consent_given": true,
  "last_active": "2024-01-14T15:30:00Z",
  "created_at": "2024-01-10T10:00:00Z"
}
```

### Collection: `posts`
```json
{
  "_id": "u001_2024-01-10_depression",
  "user_id": "u001",
  "date": "2024-01-10",
  "subreddit": "depression",
  "text": "I haven't left my bed in three days...",
  "severity": "High",
  "confidence": 0.87,
  "classified_at": "2024-01-10T11:00:00Z"
}
```

### Indexes (created at startup in `mongo_service.connect()`)
- `posts.user_id`
- `users.severity_label`
- `users.username` (unique, sparse)
- `posts.(user_id, severity)` compound

---

## Demo users (mock data)

| ID | Username | Severity | Notes |
|---|---|---|---|
| u001 | user_alpha | Critical | SuicideWatch posts, emergency contact: Jane |
| u002 | user_beta | Low | Positive posts |
| u003 | user_gamma | High | Depression/emptiness posts ("completely empty for weeks") |
| u004 | user_delta | Medium | Stress/anxiety posts |

Connections (graph, visual only): u001↔u002, u001↔u003, u002↔u004

**GOTCHA**: MongoDB may cache old u003 severity (was Low). If u003 still shows Low, clear and re-ingest: call `DELETE /api/graph/u003/posts` then `POST /api/ingest {user_id: "u003"}` then `POST /api/classify {user_id: "u003"}`.

---

## Ports

| Service | Port |
|---|---|
| Our backend | **8002** |
| Teammate's backend | 8000 (do not touch) |
| Frontend | 3000 |

---

## Known gotchas

- **`api.ts` BASE URL** must be `8002`. Linter or copilot occasionally reverts to `8000` — fix line 1 of `frontend/lib/api.ts`.
- **`backend/models/schemas.py`** is Python (Pydantic schemas), NOT ML weights. Do not gitignore it.
- **Model first run** downloads ~438MB from HuggingFace. Cached at `~/.cache/huggingface/` afterwards. Requires internet or mobile hotspot (college DNS blocks huggingface.co).
- **PyJWT must be installed**: `pip install PyJWT==2.8.0`. Not auto-installed via `pip install -r requirements.txt` on some envs.
- **Git history**: Large model files were previously committed. Repo was reinit'd fresh. `backend/models/mentalbert*/`, `v1/`, `v2/` are all gitignored at root level. `/models/` in `.gitignore` is anchored to root to avoid blocking `backend/models/schemas.py`.
- **Admin password** default is `"pokemon123"` hardcoded in `config.py`. Override with `ADMIN_PASSWORD=` in `.env`.
- **SMTP disabled by default** (`SMTP_ENABLED=false`). Set to `true` + provide Gmail App Password (not account password) to enable. SMTP runs in `run_in_executor` (thread) to avoid blocking async.

---

## Pending tasks

- **Verify u003 reclassification**: MongoDB may still have stale Low severity. Clear + re-ingest after backend starts.
- **MongoDB vector search**: Wire in when teammate's index is merged — set `MONGODB_VECTOR_INDEX=<name>` in `.env`.
- **Reddit OAuth credentials**: code is live (`auth.py` + `auth_service.py`). Create a **web app** type Reddit app, set `REDDIT_CLIENT_ID/SECRET` + redirect URI = `REDDIT_REDIRECT_URI`, then test the real login end-to-end. Until set, the username fallback (mock-login) works.
- **Test SMTP email**: Set `SMTP_ENABLED=true` + Gmail App Password → trigger Critical for u001 → verify Jane's inbox.

---

## What was dropped and why

| Dropped | Reason |
|---|---|
| Neo4j | MongoDB handles graph at this scale without extra infra |
| NetworkX / Matplotlib PNG | React Flow is interactive and live |
| Auto-detecting Reddit social graph for peer notification | Confidentiality risk; users may have no Reddit friends; peers not trained counsellors |
| Graph traversal on Critical | Replaced by user-defined emergency contacts |
| `j-hartmann` as primary model | Fine-tuned MentalBERT is more academically defensible |
| Google Gemini | Replaced by OpenAI `gpt-4o-mini` (same RAG interface) |
| Separate pages per dashboard tab | Single-page tabs share state — no re-fetch, floating chat persists |

---

## Teammate boundary

- Teammate owns ports 8000/8001. Do not run anything on those ports.
- `reddit_api.py` now implements real Reddit fetching (asyncpraw, last 90d, cleaned/PII-scrubbed) behind the same `get_posts_for_user` interface as `reddit_mock.py`. `ingestion.run_ingest` picks the source per-user via the `source` field — no manual import swap needed.
- Teammate adds MongoDB Atlas vector index on `mental_health_resources` collection. Activate by setting `MONGODB_VECTOR_INDEX` env var.
- `backend/services/auth_service.py` implements the Reddit OAuth `get_reddit_user_id(code)` + `get_reddit_authorize_url(state)` functions (asyncpraw). Reddit fetch + login share the same `REDDIT_CLIENT_ID/SECRET`.
