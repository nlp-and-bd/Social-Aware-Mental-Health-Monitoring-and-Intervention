<div align="center">
  <img src="logo_with_name.png" alt="Penumbra" width="280" />

  <h3>Mental-health early-detection, with care built in</h3>
  <p>Reddit posts → MentalBERT classification → MongoDB → RAG chatbot + consent-gated emergency-contact alerts</p>
</div>

---

## What is Penumbra?

Penumbra reads a person's public Reddit activity, classifies each post for mental-health severity using a fine-tuned **MentalBERT** model, and surfaces a calm, supportive dashboard: a severity trend, a reflective RAG chatbot, and — only at the highest severity and only with consent — a way to reach the people that person chose as their support network.

The product is deliberately conservative about privacy and harm:

- The model's crisis-keyword check runs **before** the classifier, so explicit crisis language escalates immediately.
- The chatbot **reflects and asks** — it never diagnoses or gives directive advice, and always points toward a professional.
- Outgoing emails carry **no diagnosis, no score, no post text, and never the Reddit username** — only a display name the user picked.
- Contacts must **double opt-in** before they can receive anything beyond a generic check-in.

---

## Architecture

The repo holds two cooperating subsystems that share one `.env` and one MongoDB:

| Path | What it is | Entry point |
|---|---|---|
| `backend/` + `frontend/` | **The Penumbra app** — FastAPI API (port **8002**) + Next.js dashboard (port **3000**) | `uvicorn backend.main:app` / `npm run dev` |
| `src/` + `config/` + `scripts/` | **Ingestion & privacy pipeline** — real Reddit fetching, cleaning, Fernet-encrypted PII store (`mh_raw` / `mh_pii`) | `src/api/main.py`, `scripts/*.py` |

```
Reddit ──▶ ingestion ──▶ MongoDB ──▶ MentalBERT ──▶ severity ──┬─▶ Dashboard (trend, posts, insights)
 (mock or real)            (posts/users)   (7→4 tiers)          ├─▶ RAG chatbot (ChromaDB + gpt-4o-mini)
                                                                └─▶ Response engine ─▶ helplines + contact alerts
```

## Tech stack

- **Backend** — FastAPI, Motor (async MongoDB), Pydantic v2, pydantic-settings
- **NLP** — `aiguanai/mentalbert-mental-health-v2` (HuggingFace), Transformers, PyTorch
- **RAG** — ChromaDB (local) or MongoDB Atlas `$vectorSearch`, OpenAI `gpt-4o-mini`, `all-MiniLM-L6-v2` embeddings
- **Frontend** — Next.js 16 (App Router) + React 19, TypeScript, Tailwind v4, shadcn/ui, Framer Motion, Recharts, React Flow
- **Email** — SMTP (Gmail) for alerts and double opt-in consent

## Severity model

MentalBERT's 7 classes collapse into 4 tiers, and a user's overall score is **recency-weighted** across their posts:

| MentalBERT label | Tier |
|---|---|
| Normal | Low |
| Anxiety, Stress | Medium |
| Depression, Bipolar, Personality disorder | High |
| Suicidal | Critical |

## Quickstart

> Full instructions, prerequisites, and troubleshooting live in **[SETUP.md](SETUP.md)**.

```bash
# 1. Backend (port 8002)
python -m venv venv && source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                # then fill in MONGODB_URI, OPENAI_API_KEY, …
uvicorn backend.main:app --reload --reload-dir backend --port 8002

# 2. Frontend (port 3000)
cd frontend && npm install && npm run dev
```

Open <http://localhost:3000>. Four demo users (`u001`–`u004`) bypass login and land straight on the dashboard.

## The dashboard

Four tabs, all sharing one load (no per-tab refetch):

- **Overview** — severity-over-time line (hero) plus a severity-breakdown donut and an activity heatmap.
- **Posts** — every classified post, click for the full text.
- **Actions** — recommended steps, helplines, your support network, and the Critical crisis flow.
- **Settings** — display name, contacts, consent toggles, and the danger zone.

A floating chat widget (bottom-right) is available on every tab.

## Documentation

- **[SETUP.md](SETUP.md)** — install, configure, run, and troubleshoot.
- **[CLAUDE.md](CLAUDE.md)** — deep architecture reference: model loading chain, RAG guardrails, response engine, MongoDB schema, API surface, and known gotchas.

## Demo users

| ID | Username | Severity |
|---|---|---|
| u001 | user_alpha | Critical |
| u002 | user_beta | Low |
| u003 | user_gamma | High |
| u004 | user_delta | Medium |

---

<div align="center">
  <sub>Built for early support, not surveillance. If you or someone you know is in crisis, contact a local helpline — in India, Tele-MANAS at <b>14416</b>.</sub>
</div>
