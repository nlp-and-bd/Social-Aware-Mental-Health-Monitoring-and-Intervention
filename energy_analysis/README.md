# Energy & Carbon Analysis (paper-grade)

Measures the **electricity (Wh)** and **carbon (gCO₂e)** used to *obtain* a result with the
Penumbra pipeline, for the report/paper's "energy consumed" section.

## Why this is credible (and why you don't need your CPU wattage)
It uses **[CodeCarbon](https://mlco2.github.io/codecarbon/)** — the tool most ML energy/carbon
papers cite. CodeCarbon **auto-detects your CPU model and its power draw** from a built-in
hardware database and applies **your region's grid carbon intensity** automatically. So you
do **not** need to know or enter any wattage.

## What it measures
| Stage | What | How |
|---|---|---|
| Model load | Loading MentalBERT (one-time per boot) | measured |
| Classification | MentalBERT inference per post | measured |
| Embedding | `all-MiniLM-L6-v2` per text (RAG) | measured |
| LLM response | Chatbot reply | **literature estimate** (runs remotely on OpenAI/Groq) |

## Rigor
- Each stage runs for at least `--seconds` of wall time, repeated `--reps` times.
- Reports **mean ± std** of per-item latency and energy.
- Auto-records hardware, OS, tool versions, country, and grid intensity into the report.

## Install + run
From the **project root**, in the project venv:
```bash
pip install -r energy_analysis/requirements-energy.txt
python energy_analysis/measure_energy.py
```
For the **final paper run** (tighter error bars), use more reps and longer windows:
```bash
python energy_analysis/measure_energy.py --reps 5 --seconds 20 --country IND
```
Options: `--country` (ISO3, e.g. IND/USA/GBR), `--posts-per-user`, `--llm-wh-per-query`.

## Output (written to `energy_analysis/results/`)
- `energy_report.md` — **paste-ready** Methodology + results tables for your paper.
- `energy_report.json` — all numbers + the exact environment/assumptions (reproducible).
- `energy_runs.csv` — raw per-repetition data (for your own plots/stats).

## Important limitation (state this in the paper)
On **Windows**, Intel RAPL hardware energy counters are not accessible, so CodeCarbon
**models** CPU energy from the detected CPU's power profile rather than reading a sensor.
The numbers are credible estimates, not meter readings. For sensor-accurate results, run on
**Linux with Intel RAPL**, or use a hardware wall-socket power meter. The `--country` grid
factor and the LLM per-reply estimate are the other documented assumptions.

## The LLM number
The chatbot's text generation runs on a third-party API (OpenAI/Groq), so its energy can't
be metered locally. We report a configurable literature-based estimate (`--llm-wh-per-query`,
default 0.30 Wh). Published per-query estimates for LLM inference vary; cite your chosen source.
