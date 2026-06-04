# Penumbra — Setup & Troubleshooting

Everything needed to get the backend (port **8002**) and frontend (port **3000**) running locally, plus fixes for the problems that actually come up.

> Architecture and internals live in [CLAUDE.md](CLAUDE.md). This file is the practical "make it run" guide.

---

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Python | 3.10 – 3.12 | 3.13 not tested with the pinned `torch` |
| Node.js | 18+ (20 LTS recommended) | for the Next.js frontend |
| MongoDB | Atlas cluster **or** local `mongod` | connection string goes in `.env` |
| Git | any | `git-lfs` only if you intend to commit model weights (you shouldn't) |
| Internet | first run only | downloads ~438 MB MentalBERT from HuggingFace |

You also need:
- An **OpenAI API key** (for the RAG chatbot).
- *(Optional)* a **Gmail App Password** if you want to test emergency-contact emails.

---

## 2. Clone & configure environment

```bash
git clone <repo-url> "nlp pbl"
cd "nlp pbl"
cp .env.example .env
```

Open `.env` and fill in at least these:

```bash
MONGODB_URI=mongodb+srv://<user>:<pwd>@<cluster>.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=mental_health_db
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
MENTALBERT_MODEL_PATH=./models/v2        # local fallback; HuggingFace is tried first
EMBEDDING_MODEL=all-MiniLM-L6-v2
```

Optional blocks (safe to leave blank/default to start):

```bash
# RAG via MongoDB Atlas vector search — leave empty to use local ChromaDB
MONGODB_VECTOR_INDEX=
MONGODB_VECTOR_COLLECTION=mental_health_resources
MONGODB_VECTOR_FIELD=embedding

# Emergency-contact email
SMTP_ENABLED=false
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=                # Gmail App Password — NOT your account password
SMTP_FROM=Penumbra <noreply@example.com>
PUBLIC_BASE_URL=http://localhost:8002

# Admin dashboard
ADMIN_PASSWORD=pokemon123      # change this
JWT_SECRET=change-me-in-production
```

> **Never commit `.env`.** It is git-ignored. Only `.env.example` (placeholders) belongs in git.

---

## 3. Backend

```bash
# from the project root
python -m venv venv
source venv/bin/activate            # Windows: venv\Scripts\activate

pip install -r requirements.txt
pip install PyJWT==2.8.0            # belt-and-suspenders — see troubleshooting

uvicorn backend.main:app --reload --reload-dir backend --port 8002
```

What you should see on a healthy boot:

```
[DB] MongoDB connected.
... (first run) downloading model from huggingface.co ...
INFO:     Uvicorn running on http://127.0.0.1:8002
```

- API docs: <http://localhost:8002/docs>
- The `--reload-dir backend` flag is **mandatory** — without it, ChromaDB writing to `chroma_db/` triggers a full reload mid-startup.

---

## 4. Frontend

```bash
cd frontend
npm install
npm run dev                         # http://localhost:3000
```

Confirm `frontend/.env.local` contains:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8002/api
```

Open <http://localhost:3000>. The four demo users (`u001`–`u004`) skip login and go straight to a dashboard.

---

## 5. First-run model download

On first classify, the backend pulls `aiguanai/mentalbert-mental-health-v2` (~438 MB) from HuggingFace and caches it at `~/.cache/huggingface/`. Subsequent runs are offline-friendly.

Load order (first success wins):

1. `aiguanai/mentalbert-mental-health-v2` (HuggingFace)
2. `./models/v2` (local)
3. `./models/v1` (local)
4. `j-hartmann/emotion-english-distilroberta-base` (HuggingFace fallback)

If you have local weights in `./models/v2`, set `MENTALBERT_MODEL_PATH=./models/v2` and you can run without network.

---

## 6. Optional: test SMTP email

```bash
# fills SMTP_USER / SMTP_PASSWORD from .env and attempts a login
python test_smtp.py
# → "AUTH OK — <you>@gmail.com credentials are correct"
```

Then set `SMTP_ENABLED=true` in `.env`, restart the backend, and trigger a Critical evaluation (e.g. demo user `u001`) to send a real check-in.

---

## Troubleshooting

### Backend won't start / "connection refused" on :8002
- Make sure you launched with the exact command in §3, **including** `--reload-dir backend`.
- Port already in use? Find and free it: `lsof -i :8002` (mac/Linux) or `netstat -ano | findstr :8002` (Windows).
- **Do not** use ports 8000/8001 — those belong to the ingestion pipeline / a teammate.

### `ModuleNotFoundError: No module named 'jwt'`
PyJWT isn't always pulled in by `pip install -r requirements.txt` on every environment:
```bash
pip install PyJWT==2.8.0
```

### Model download fails / hangs (`huggingface.co` unreachable)
- Many campus/college networks block `huggingface.co` via DNS. Use a mobile hotspot or VPN for the first download.
- Or run fully local: place weights in `./models/v2` and set `MENTALBERT_MODEL_PATH=./models/v2`.
- Clear a corrupted partial download: delete `~/.cache/huggingface/` and retry.

### Frontend calls the wrong port (404s / CORS errors)
- `frontend/lib/api.ts` line 1 hardcodes a fallback base URL. A linter/copilot **occasionally rewrites `8002` → `8000`** — open the file and fix it back to `http://localhost:8002/api`.
- Backend CORS only allows `http://localhost:3000`; run the frontend there, not on `127.0.0.1` or another port.

### Demo user `u003` shows the wrong severity (Low instead of High)
MongoDB can cache a stale classification. Re-ingest:
```bash
curl -X DELETE http://localhost:8002/api/graph/user/u003/posts
curl -X POST   http://localhost:8002/api/ingest   -H "Content-Type: application/json" -d '{"user_id":"u003"}'
curl -X POST   http://localhost:8002/api/classify -H "Content-Type: application/json" -d '{"user_id":"u003"}'
```

### MongoDB connection / auth errors
- Atlas: confirm your current IP is in **Network Access → IP Allow List**.
- URL-encode special characters in the password inside `MONGODB_URI` (`@` → `%40`, etc.).
- Local Mongo: make sure `mongod` is running and `MONGODB_URI=mongodb://localhost:27017`.

### SMTP login fails
- Use a **Gmail App Password** (16 chars, no spaces) — your normal account password will be rejected.
- App Passwords require 2-Step Verification enabled on the Google account.
- Still failing? Run `python test_smtp.py` to isolate it from the app.

### `git` wants to commit a huge `.safetensors` / model file
Model weights are git-ignored on purpose (`*.safetensors`, `/models/`, `backend/models/v1|v2|mentalbert*/`). If one slipped in earlier:
```bash
git rm --cached path/to/model.safetensors
```
Pydantic schemas at `backend/models/schemas.py` are **not** weights and are explicitly kept in git — don't delete them.

### Admin dashboard won't log in
- Default password is `pokemon123` (set in `backend/config.py`); override with `ADMIN_PASSWORD` in `.env`.
- The token lasts 8h and lives in `sessionStorage["admin_token"]` — clear it if you rotate the password.

---

## Security note — rotate the old SMTP credential

An earlier version of `test_smtp.py` had a real Gmail address and App Password hardcoded. The file now reads from `.env` instead, but the old password may still exist in git history. **Revoke that App Password** at <https://myaccount.google.com/apppasswords> and generate a fresh one. Consider scrubbing it from history with `git filter-repo` if the repo is shared.

---

## Handy commands

```bash
# Backend with API docs
uvicorn backend.main:app --reload --reload-dir backend --port 8002   # /docs

# Frontend
cd frontend && npm run dev          # dev
cd frontend && npm run build        # production build / typecheck

# Pipeline sanity scripts (src/ + config/)
python scripts/test_mongo.py
python scripts/test_pipeline.py
```
