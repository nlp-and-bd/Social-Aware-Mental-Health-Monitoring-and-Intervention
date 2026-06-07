"""
Energy & carbon analysis.

Primary engine: CodeCarbon (https://mlco2.github.io/codecarbon/), the de-facto tool
cited in ML energy/carbon papers. It AUTO-DETECTS your CPU model and its power draw
(from a hardware database) and applies your region's grid carbon intensity — so you
do NOT need to know your CPU wattage.

It measures the compute cost of *obtaining* a result for the stages the project runs:
  1. Model load       — loading MentalBERT (one-time per server boot)
  2. Classification   — MentalBERT inference per post
  3. Embedding        — all-MiniLM-L6-v2 per text (RAG)
  4. LLM response     — literature-based estimate (the chatbot LLM runs remotely on
                        OpenAI/Groq and cannot be metered locally)

Rigor for reproducibility:
  - Each stage is run for >= --seconds of wall time, repeated --reps times.
  - Per-item energy/latency reported as mean ± std across repetitions.
  - Hardware, OS, tool versions, country and grid intensity are auto-recorded.

Limitation (state this in the paper): on Windows, CodeCarbon cannot read Intel RAPL
hardware counters (Linux-only), so CPU energy is modelled from the detected CPU's TDP
in CodeCarbon's database. For sensor-accurate numbers, run on Linux (Intel RAPL) or
use a hardware wall-meter. The figures here are credible estimates, not meter readings.

Run from the project root, in the project venv:
    python energy_analysis/measure_energy.py
    python energy_analysis/measure_energy.py --reps 5 --seconds 15 --country IND
"""
from __future__ import annotations

import argparse
import csv
import json
import platform
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
RESULTS_DIR = Path(__file__).resolve().parent / "results"

SAMPLE_TEXTS = [
    "I haven't been able to get out of bed for days and everything feels pointless.",
    "Work has been really stressful lately and I can't seem to switch off at night.",
    "Had a good day today, went for a walk and actually felt a bit lighter.",
    "I feel so anxious before every meeting, my heart races and I can't focus.",
    "Lately I feel completely alone, like no one would notice if I disappeared.",
    "Trying to keep a routine helps a little, but the low moods keep coming back.",
]


def _new_tracker(country: str):
    from codecarbon import OfflineEmissionsTracker
    return OfflineEmissionsTracker(
        country_iso_code=country,
        measure_power_secs=1,
        save_to_file=False,
        log_level="error",
        allow_multiple_runs=True,
    )


def _emit_fields(data) -> dict:
    g = lambda a, d=0.0: getattr(data, a, d) or 0.0
    return {
        "duration_s": g("duration"),
        "energy_kwh": g("energy_consumed"),
        "cpu_energy_kwh": g("cpu_energy"),
        "ram_energy_kwh": g("ram_energy"),
        "gpu_energy_kwh": g("gpu_energy"),
        "emissions_kg": g("emissions"),
        "cpu_power_w": g("cpu_power"),
        "ram_power_w": g("ram_power"),
    }


def measure_stage(name: str, fn, target_seconds: float, reps: int, country: str) -> list[dict]:
    rows = []
    for rep in range(reps):
        tracker = _new_tracker(country)
        tracker.start()
        iters = 0
        t0 = time.perf_counter()
        while time.perf_counter() - t0 < target_seconds:
            fn()
            iters += 1
        wall = time.perf_counter() - t0
        tracker.stop()
        f = _emit_fields(tracker.final_emissions_data)
        energy_wh = f["energy_kwh"] * 1000.0
        rows.append({
            "stage": name, "rep": rep + 1, "iters": iters,
            "wall_s": round(wall, 4),
            "per_item_ms": round(wall / iters * 1000, 4) if iters else 0.0,
            "per_item_mwh": round(energy_wh / iters * 1000, 6) if iters else 0.0,
            "stage_energy_wh": round(energy_wh, 6),
            "stage_co2_g": round(f["emissions_kg"] * 1000, 6),
            "cpu_power_w": round(f["cpu_power_w"], 3),
            "ram_power_w": round(f["ram_power_w"], 3),
        })
        print(f"  {name} rep {rep+1}/{reps}: {iters} iters, "
              f"{rows[-1]['per_item_ms']:.2f} ms/item, {rows[-1]['per_item_mwh']:.5f} mWh/item")
    return rows


def measure_model_load(load_fn, country: str) -> dict:
    tracker = _new_tracker(country)
    tracker.start()
    t0 = time.perf_counter()
    load_fn()
    wall = time.perf_counter() - t0
    tracker.stop()
    f = _emit_fields(tracker.final_emissions_data)
    return {
        "stage": "model_load_mentalbert", "rep": 1, "iters": 1,
        "wall_s": round(wall, 4), "per_item_ms": round(wall * 1000, 2),
        "per_item_mwh": round(f["energy_kwh"] * 1000 * 1000, 4),
        "stage_energy_wh": round(f["energy_kwh"] * 1000, 6),
        "stage_co2_g": round(f["emissions_kg"] * 1000, 6),
        "cpu_power_w": round(f["cpu_power_w"], 3), "ram_power_w": round(f["ram_power_w"], 3),
    }


def _mean_std(values: list[float]) -> tuple[float, float]:
    if not values:
        return 0.0, 0.0
    m = statistics.mean(values)
    s = statistics.stdev(values) if len(values) > 1 else 0.0
    return m, s


def main() -> None:
    ap = argparse.ArgumentParser(description="Paper-grade energy/carbon analysis (CodeCarbon).")
    ap.add_argument("--reps", type=int, default=3, help="Repetitions per stage (mean ± std).")
    ap.add_argument("--seconds", type=float, default=8.0, help="Min wall-time per stage per rep.")
    ap.add_argument("--country", type=str, default="IND", help="ISO3 country for grid intensity (e.g. IND, USA).")
    ap.add_argument("--posts-per-user", type=int, default=50, help="Avg posts ingested per user (90 days).")
    ap.add_argument("--llm-wh-per-query", type=float, default=0.30,
                    help="Estimated energy per LLM chat reply in Wh (literature; see README).")
    args = ap.parse_args()

    try:
        import codecarbon  # noqa: F401
    except ImportError:
        sys.exit("codecarbon is required. Install: pip install -r energy_analysis/requirements-energy.txt")

    print("=" * 72)
    print("Penumbra — Energy & Carbon Analysis (CodeCarbon)")
    print("=" * 72)

    rows: list[dict] = []

    # Stage 1: model load
    from backend.services import nlp_service
    print("Loading MentalBERT (downloads ~438MB on first run)…")
    rows.append(measure_model_load(nlp_service.load_model, args.country))
    nlp_service.classify_text(SAMPLE_TEXTS[0])  # warmup

    # Stage 2: classification
    c = {"i": 0}
    def _classify():
        nlp_service.classify_text(SAMPLE_TEXTS[c["i"] % len(SAMPLE_TEXTS)]); c["i"] += 1
    print(f"Classification — {args.reps} reps x >={args.seconds}s…")
    rows += measure_stage("classification", _classify, args.seconds, args.reps, args.country)

    # Stage 3: embeddings
    from sentence_transformers import SentenceTransformer
    from backend.config import settings
    print(f"Loading embedding model ({settings.EMBEDDING_MODEL})…")
    embed_model = SentenceTransformer(settings.EMBEDDING_MODEL)
    embed_model.encode(SAMPLE_TEXTS[0])  # warmup
    e = {"i": 0}
    def _embed():
        embed_model.encode(SAMPLE_TEXTS[e["i"] % len(SAMPLE_TEXTS)]); e["i"] += 1
    print(f"Embedding — {args.reps} reps x >={args.seconds}s…")
    rows += measure_stage("embedding", _embed, args.seconds, args.reps, args.country)

    # ---- hardware / grid metadata (from CodeCarbon) ---------------------------
    probe = _new_tracker(args.country)
    probe.start(); time.sleep(0.2); probe.stop()
    d = probe.final_emissions_data
    grid_intensity = (d.emissions / d.energy_consumed) if getattr(d, "energy_consumed", 0) else 0.0
    env = {
        "cpu_model": getattr(d, "cpu_model", "unknown"),
        "cpu_count": getattr(d, "cpu_count", None),
        "cpu_power_w_detected": round(getattr(d, "cpu_power", 0.0) or 0.0, 2),
        "ram_total_gb": round((getattr(d, "ram_total_size", 0) or 0), 2),
        "gpu_model": getattr(d, "gpu_model", None),
        "os": getattr(d, "os", platform.platform()),
        "python_version": getattr(d, "python_version", platform.python_version()),
        "codecarbon_version": getattr(d, "codecarbon_version", ""),
        "country_name": getattr(d, "country_name", args.country),
        "country_iso_code": getattr(d, "country_iso_code", args.country),
        "grid_carbon_intensity_kg_per_kwh": round(grid_intensity, 5),
    }

    # ---- aggregate per-item (mean ± std across reps) --------------------------
    def agg(stage, key):
        return _mean_std([r[key] for r in rows if r["stage"] == stage])

    cls_ms, cls_ms_sd = agg("classification", "per_item_ms")
    cls_mwh, cls_mwh_sd = agg("classification", "per_item_mwh")
    emb_ms, emb_ms_sd = agg("embedding", "per_item_ms")
    emb_mwh, emb_mwh_sd = agg("embedding", "per_item_mwh")
    load_row = next(r for r in rows if r["stage"] == "model_load_mentalbert")

    def co2_g(wh):
        return (wh / 1000.0) * grid_intensity * 1000.0

    n = args.posts_per_user
    cls_wh, emb_wh = cls_mwh / 1000.0, emb_mwh / 1000.0
    per_user_wh = n * (cls_wh + emb_wh)
    per_reply_wh = emb_wh + args.llm_wh_per_query
    per_1k_wh = cls_wh * 1000

    derived = {
        "per_classification_mwh": round(cls_mwh, 6), "per_classification_mwh_std": round(cls_mwh_sd, 6),
        "per_classification_ms": round(cls_ms, 3), "per_classification_ms_std": round(cls_ms_sd, 3),
        "per_embedding_mwh": round(emb_mwh, 6), "per_embedding_mwh_std": round(emb_mwh_sd, 6),
        "per_embedding_ms": round(emb_ms, 3), "per_embedding_ms_std": round(emb_ms_sd, 3),
        "model_load_mwh": load_row["per_item_mwh"], "model_load_ms": load_row["per_item_ms"],
        "per_1000_classifications_wh": round(per_1k_wh, 5), "per_1000_classifications_gco2": round(co2_g(per_1k_wh), 5),
        "per_user_profile_wh": round(per_user_wh, 6), "per_user_profile_gco2": round(co2_g(per_user_wh), 6),
        "per_chatbot_reply_wh": round(per_reply_wh, 6), "per_chatbot_reply_gco2": round(co2_g(per_reply_wh), 6),
    }

    # ---- print summary --------------------------------------------------------
    print("\n" + "-" * 72)
    print(f"Hardware: {env['cpu_model']} ({env['cpu_count']} cores), "
          f"detected CPU power {env['cpu_power_w_detected']} W")
    print(f"Grid: {env['country_name']} @ {env['grid_carbon_intensity_kg_per_kwh']} kgCO2/kWh "
          f"(CodeCarbon {env['codecarbon_version']})")
    print("-" * 72)
    print(f"Per classification : {cls_mwh:.5f} ± {cls_mwh_sd:.5f} mWh   ({cls_ms:.1f} ± {cls_ms_sd:.1f} ms)")
    print(f"Per embedding      : {emb_mwh:.5f} ± {emb_mwh_sd:.5f} mWh   ({emb_ms:.1f} ± {emb_ms_sd:.1f} ms)")
    print(f"Model load (1x)    : {load_row['per_item_mwh']:.3f} mWh   ({load_row['per_item_ms']:.0f} ms)")
    print(f"Per 1000 classifications : {per_1k_wh:.4f} Wh  /  {co2_g(per_1k_wh):.4f} gCO2e")
    print(f"Obtain 1 user profile ({n} posts) : {per_user_wh:.5f} Wh  /  {co2_g(per_user_wh):.5f} gCO2e")
    print(f"Obtain 1 chatbot reply (embed+LLM est {args.llm_wh_per_query} Wh) : "
          f"{per_reply_wh:.4f} Wh  /  {co2_g(per_reply_wh):.4f} gCO2e")

    # ---- write outputs --------------------------------------------------------
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "config": {"reps": args.reps, "seconds_per_stage": args.seconds,
                   "posts_per_user": n, "llm_wh_per_query_estimate": args.llm_wh_per_query},
        "environment": env,
        "raw_runs": rows,
        "derived": derived,
    }
    (RESULTS_DIR / "energy_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

    with (RESULTS_DIR / "energy_runs.csv").open("w", newline="", encoding="utf-8") as fp:
        w = csv.DictWriter(fp, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)

    _write_markdown(RESULTS_DIR / "energy_report.md", env, derived, args)

    print(f"\nSaved: energy_report.json, energy_runs.csv, energy_report.md  (in {RESULTS_DIR})")


def _write_markdown(path: Path, env: dict, d: dict, args) -> None:
    md = f"""# Energy & Carbon Footprint of the Penumbra Pipeline

## Methodology
Energy use was measured with **CodeCarbon {env['codecarbon_version']}**, which estimates
processor energy from the detected CPU's power profile and converts it to CO₂-equivalent
using the regional grid carbon intensity. Each stage was executed for at least
{args.seconds:.0f} s of wall-clock time and repeated {args.reps} times; we report the
mean ± standard deviation of per-item latency and energy. The chatbot's LLM runs on a
third-party API (OpenAI/Groq) and is therefore reported as a literature-based estimate
of {args.llm_wh_per_query} Wh per reply rather than a local measurement.

**Hardware/software:** {env['cpu_model']} ({env['cpu_count']} logical cores), detected CPU
power {env['cpu_power_w_detected']} W; RAM {env['ram_total_gb']} GB; OS {env['os']};
Python {env['python_version']}. **Grid:** {env['country_name']}
({env['grid_carbon_intensity_kg_per_kwh']} kgCO₂/kWh).

*Limitation:* on Windows, Intel RAPL counters are unavailable, so CPU energy is modelled
from the CPU's TDP rather than read from hardware sensors; treat values as credible
estimates, not meter readings.

## Per-operation results (mean ± std)
| Operation | Latency | Energy |
|---|---|---|
| MentalBERT classification (1 post) | {d['per_classification_ms']:.1f} ± {d['per_classification_ms_std']:.1f} ms | {d['per_classification_mwh']:.5f} ± {d['per_classification_mwh_std']:.5f} mWh |
| Embedding (1 text, all-MiniLM-L6-v2) | {d['per_embedding_ms']:.1f} ± {d['per_embedding_ms_std']:.1f} ms | {d['per_embedding_mwh']:.5f} ± {d['per_embedding_mwh_std']:.5f} mWh |
| Model load (once per boot) | {d['model_load_ms']:.0f} ms | {d['model_load_mwh']:.3f} mWh |

## Aggregate / "energy to obtain a result"
| Task | Energy | CO₂e |
|---|---|---|
| 1,000 classifications | {d['per_1000_classifications_wh']:.4f} Wh | {d['per_1000_classifications_gco2']:.4f} g |
| Profile one user ({args.posts_per_user} posts: classify + embed) | {d['per_user_profile_wh']:.5f} Wh | {d['per_user_profile_gco2']:.5f} g |
| One chatbot reply (embedding + LLM estimate) | {d['per_chatbot_reply_wh']:.4f} Wh | {d['per_chatbot_reply_gco2']:.4f} g |

## Takeaways
- On-device inference (classification + embeddings) is in the **sub-milliwatt-hour** range
  per item — its carbon footprint is negligible.
- The **LLM reply dominates** the chatbot's energy and occurs off-device on a third-party API.
- Reproduce with: `python energy_analysis/measure_energy.py --reps {args.reps} --seconds {int(args.seconds)} --country {args.country}`
"""
    path.write_text(md, encoding="utf-8")


if __name__ == "__main__":
    main()
